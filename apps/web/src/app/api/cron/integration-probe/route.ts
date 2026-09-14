import { NextRequest, NextResponse } from "next/server"

import { validateCronSecret } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { transitionOperationalAlert, upsertOperationalAlert } from "@/lib/operational-alerts"
import { runIntegrationProbes, type IntegrationProbeResult } from "@/lib/integrations/probe"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * 外部集成契约探针（systemd timer 每 6 小时 + 部署后验证共用）。
 * 失败/降级落 OperationalAlert（fingerprint 去重 + 抑制窗口，critical 发飞书）。
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  }

  const results = await runIntegrationProbes()
  const summary = {
    healthy: results.filter((r) => r.status === "healthy").length,
    degraded: results.filter((r) => r.status === "degraded").length,
    quota_blocked: results.filter((r) => r.status === "quota_blocked").length,
    unconfigured: results.filter((r) => r.status === "unconfigured").length,
    failed: results.filter((r) => r.status === "failed").length,
  }

  const alerts = await reportProblems(results).catch((error) => {
    console.error("[integration-probe] 告警落库失败（不影响探针报告）:", error instanceof Error ? error.message : error)
    return { opened: 0, resolved: 0 }
  })

  return NextResponse.json({ ranAt: new Date().toISOString(), summary, alerts, results })
}

/** 探针发现的问题落库告警：failed=error（critical 发飞书）；degraded/quota_blocked=warn */
async function reportProblems(results: IntegrationProbeResult[]): Promise<{ opened: number; resolved: number }> {
  const problems = results.filter((r) => r.status === "failed" || r.status === "degraded" || r.status === "quota_blocked")
  for (const problem of problems) {
    const severity = problem.status === "failed" ? "error" : "warning"
    await upsertOperationalAlert({
      fingerprint: `integration-probe:${problem.name}:${problem.status}`,
      rule: "integration_contract_probe",
      severity,
      summary: `[${problem.name}] ${problem.status}${problem.detail ? `：${problem.detail}` : ""}`,
      source: "integration-probe",
      metadata: { latencyMs: problem.latencyMs, critical: problem.critical },
    })
  }

  // 条件恢复即自动关闭：探针告警此前只开不关，时间一长又把真实告警淹没
  // （2026-09-14 实测：3 条早已恢复的探针错误仍挂未关闭）。这里只收敛本探针
  // 自己的指纹（integration-probe:<name>:*），不碰其他来源的告警。
  const healthyNames = results
    .filter((result) => result.status === "healthy" || result.status === "unconfigured")
    .map((result) => result.name)
  let resolved = 0
  for (const name of healthyNames) {
    const open = await prisma.operationalAlert.findMany({
      where: {
        rule: "integration_contract_probe",
        status: { not: "resolved" },
        fingerprint: { startsWith: `integration-probe:${name}:` },
      },
      select: { id: true },
      // 有界：单个探针最多同时存在 3 种非成功态（failed/degraded/quota_blocked），
      // 给足余量并满足查询有界性门禁。
      take: 20,
    })
    for (const alert of open) {
      try {
        await transitionOperationalAlert({ id: alert.id, transition: "resolved", adminId: "auto:integration-probe" })
        resolved += 1
      } catch {
        // 自动收敛失败不影响探针报告本身
      }
    }
  }
  return { opened: problems.length, resolved }
}
