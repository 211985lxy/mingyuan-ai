import { NextRequest, NextResponse } from "next/server"

import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { upsertOperationalAlert } from "@/lib/operational-alerts"
import { runIntegrationProbes, type IntegrationProbeResult } from "@/lib/integrations/probe"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * 外部集成契约探针（systemd timer 每 6 小时 + 部署后验证共用）。
 * 失败/降级落 OperationalAlert（fingerprint 去重 + 抑制窗口，critical 发飞书）。
 */
export async function GET(request: NextRequest) {
  const denied = await authorizeCronJob(request, "integration-probe")
  if (denied) return denied

  const results = await runIntegrationProbes()
  const summary = {
    healthy: results.filter((r) => r.status === "healthy").length,
    degraded: results.filter((r) => r.status === "degraded").length,
    quota_blocked: results.filter((r) => r.status === "quota_blocked").length,
    unconfigured: results.filter((r) => r.status === "unconfigured").length,
    failed: results.filter((r) => r.status === "failed").length,
  }

  await reportProblems(results).catch((error) => {
    console.error("[integration-probe] 告警落库失败（不影响探针报告）:", error instanceof Error ? error.message : error)
  })

  return NextResponse.json({ ranAt: new Date().toISOString(), summary, results })
}

/** 探针发现的问题落库告警：failed=error（critical 发飞书）；degraded/quota_blocked=warn */
async function reportProblems(results: IntegrationProbeResult[]): Promise<void> {
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
}
