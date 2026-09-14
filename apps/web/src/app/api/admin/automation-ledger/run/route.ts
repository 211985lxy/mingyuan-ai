import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  AUTOMATION_RUN_MUTEX_SECONDS,
  findAutomationTaskSpec,
  isAutomationTaskDisabled,
  parseDisabledTaskIds,
} from "@/lib/aim/automation-ledger"

export const runtime = "nodejs"
export const maxDuration = 120

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status })
}

/**
 * WP-A2 V2：手动触发一个定时任务（admin）。
 *
 * 设计（见增量计划 WP-A2 V2）：
 * - 只能触发台账注册表内的任务；端点即现有 cron 路由，不新建执行器
 * - 互斥：同一任务 5 分钟内不可重复触发（Redis SETNX），防手抖重复执行
 * - 审计：admin-audit 记录 started/success/failed，可追溯谁在何时手动触发
 * - 停用中的任务拒绝触发（闸门语义：停用 = 任务体不跑）
 */
export async function POST(request: NextRequest) {
  return withAdminOnly(async (req, { admin }) => {
    const body = await parseJsonRecord(req)
    const id = typeof body.id === "string" ? body.id.trim() : ""
    if (!id) return errorResponse("MISSING_ID", "缺少任务 id", 400)

    const spec = findAutomationTaskSpec(id)
    if (!spec) return errorResponse("UNKNOWN_TASK", "任务不在台账注册表内", 404)

    // 停用闸门：台账页对该任务展示「已停用」且按钮置灰，此处兜底（纵深防御）
    if (isAutomationTaskDisabled(parseDisabledTaskIds(process.env.AIM_AUTOMATION_TASKS_DISABLED), id)) {
      return errorResponse("TASK_DISABLED", "该任务已在环境配置中停用（AIM_AUTOMATION_TASKS_DISABLED）", 409)
    }

    // 互斥：同一任务 5 分钟内不可重复触发
    const mutexKey = `automation-ledger:run:${id}`
    const acquired = await redis.set(mutexKey, admin.id, "EX", AUTOMATION_RUN_MUTEX_SECONDS, "NX")
    if (!acquired) {
      return errorResponse("MUTEX_HELD", `该任务 5 分钟内已被触发过，请稍后再试`, 429)
    }

    await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "automation.task.run",
      targetType: "automation_task",
      targetId: id,
      status: "started",
      metadata: { endpoint: spec.endpoint },
    })

    const outcome = await runTaskAndAudit(request, admin.id, id, spec.endpoint)
    if (outcome.ok) {
      return NextResponse.json({
        ok: true,
        taskId: id,
        endpoint: spec.endpoint,
        httpStatus: outcome.httpStatus,
        result: outcome.result,
      })
    }
    return errorResponse("RUN_FAILED", `任务执行失败：${outcome.message}`, 502)
  })(request, { params: Promise.resolve({}) })
}

type RunOutcome =
  | { ok: true; httpStatus: number; result: unknown }
  | { ok: false; message: string }

/** 经本机回环调用现有 cron 路由（与 systemd 单元同一入口，不另建执行器），并落审计。 */
async function runTaskAndAudit(
  request: NextRequest,
  adminId: string,
  id: string,
  endpoint: string,
): Promise<RunOutcome> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    await recordAdminAudit({
      request,
      adminId,
      action: "automation.task.run",
      targetType: "automation_task",
      targetId: id,
      status: "failed",
      severity: "error",
      metadata: { endpoint, error: "CRON_SECRET 未配置" },
    })
    return { ok: false, message: "服务端未配置 CRON_SECRET，无法内部触发" }
  }

  const port = process.env.PORT || "3000"
  const url = `http://127.0.0.1:${port}${endpoint}`
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(110_000),
    })
    const text = await response.text()
    let payload: unknown = text.slice(0, 1500)
    try {
      payload = JSON.parse(text)
    } catch {
      // 非 JSON（如 HTML 错误页）保留截断文本
    }
    await recordAdminAudit({
      request,
      adminId,
      action: "automation.task.run",
      targetType: "automation_task",
      targetId: id,
      status: response.ok ? "success" : "failed",
      severity: response.ok ? "info" : "error",
      metadata: { endpoint, httpStatus: response.status },
    })
    return response.ok
      ? { ok: true as const, httpStatus: response.status, result: payload }
      : { ok: false as const, message: `上游返回 HTTP ${response.status}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : "触发失败"
    await recordAdminAudit({
      request,
      adminId,
      action: "automation.task.run",
      targetType: "automation_task",
      targetId: id,
      status: "failed",
      severity: "error",
      metadata: { endpoint, error: message.slice(0, 300) },
    })
    return { ok: false, message }
  }
}
