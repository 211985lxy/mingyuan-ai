import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { env } from "@/env"
import { AUTOMATION_JOB_CATALOG, type AutomationJobId } from "@/lib/aim/automation-ledger-catalog"
import { isAutomationJobEnabled } from "@/lib/aim/automation-job-flags-store"
import { mutexKey } from "@/lib/aim/automation-job-flags"

export const MANUAL_RUN_MUTEX_MS = 5 * 60 * 1000
export const MANUAL_RUN_KIND = "automation_ledger_run"

export { mutexKey, mutexSlot } from "@/lib/aim/automation-job-flags"

export function findJobOrThrow(jobId: string) {
  const job = AUTOMATION_JOB_CATALOG.find((item) => item.id === jobId)
  if (!job) throw new Error("未知任务")
  return job
}

type TaskDelegate = {
  findUnique(args: unknown): Promise<{ id: string; idempotencyKey: string } | null>
  create(args: unknown): Promise<{ id: string }>
}

function tasks(): TaskDelegate | null {
  return (prisma as unknown as { backgroundTask?: TaskDelegate }).backgroundTask ?? null
}

export async function acquireManualRunMutex(jobId: AutomationJobId, now = new Date()): Promise<"acquired" | "blocked"> {
  const delegate = tasks()
  if (!delegate) return "acquired"
  const key = mutexKey(jobId, now)
  const existing = await delegate.findUnique({ where: { idempotencyKey: key } })
  if (existing) return "blocked"
  try {
    await delegate.create({
      data: {
        kind: MANUAL_RUN_KIND,
        aggregateType: "automation_job",
        aggregateId: jobId,
        idempotencyKey: key,
        status: "succeeded",
        completedAt: now,
      },
    })
    return "acquired"
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return "blocked"
    }
    throw error
  }
}

async function loadCronHandler(cronPath: string): Promise<(request: NextRequest) => Promise<NextResponse>> {
  const loaders: Record<string, () => Promise<{ GET: (request: NextRequest) => Promise<NextResponse> }>> = {
    "/api/cron/topic-daily": () => import("@/app/api/cron/topic-daily/route"),
    "/api/cron/aihot-briefing": () => import("@/app/api/cron/aihot-briefing/route"),
    "/api/cron/douyin-hot": () => import("@/app/api/cron/douyin-hot/route"),
    "/api/cron/market-hotlist": () => import("@/app/api/cron/market-hotlist/route"),
    "/api/cron/background-tasks": () => import("@/app/api/cron/background-tasks/route"),
    "/api/cron/integration-probe": () => import("@/app/api/cron/integration-probe/route"),
    "/api/cron/operational-alerts": () => import("@/app/api/cron/operational-alerts/route"),
    "/api/cron/audit-reconcile": () => import("@/app/api/cron/audit-reconcile/route"),
    "/api/cron/outcome-flywheel": () => import("@/app/api/cron/outcome-flywheel/route"),
    "/api/cron/channel-metrics-rollup": () => import("@/app/api/cron/channel-metrics-rollup/route"),
    "/api/cron/control-center-retention": () => import("@/app/api/cron/control-center-retention/route"),
    "/api/cron/cleanup": () => import("@/app/api/cron/cleanup/route"),
  }
  const loader = loaders[cronPath]
  if (!loader) throw new Error("该任务没有可调用的现成调度入口")
  const mod = await loader()
  return mod.GET
}

export async function runAutomationJobNow(jobId: AutomationJobId, now = new Date()): Promise<{
  status: number
  body: unknown
}> {
  const job = findJobOrThrow(jobId)
  if (!(await isAutomationJobEnabled(job.id))) {
    return { status: 409, body: { error: "任务已停用，只空转", jobId } }
  }
  if ((await acquireManualRunMutex(job.id, now)) === "blocked") {
    return { status: 409, body: { error: "五分钟内已执行过，先等一等", jobId } }
  }
  const secret = env.CRON_SECRET
  if (!secret) return { status: 500, body: { error: "未配置 CRON_SECRET" } }
  const handler = await loadCronHandler(job.cronPath)
  const request = new NextRequest(new URL(job.cronPath, "http://127.0.0.1"), {
    headers: { authorization: `Bearer ${secret}` },
  })
  const response = await handler(request)
  const body = await response.json().catch(() => ({ ok: response.ok }))
  return { status: response.status, body }
}
