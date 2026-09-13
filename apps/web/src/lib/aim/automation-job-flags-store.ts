import { prisma } from "@/lib/prisma"
import {
  isJobEnabledByOverlay,
  jobEnabledSettingKey,
} from "@/lib/aim/automation-job-flags"
import type { AutomationJobId } from "@/lib/aim/automation-ledger-catalog"
import { AUTOMATION_JOB_CATALOG } from "@/lib/aim/automation-ledger-catalog"

type SettingDelegate = {
  findMany(args: unknown): Promise<Array<{ key: string; value: string }>>
  upsert(args: unknown): Promise<{ key: string; value: string }>
}

function settings(): SettingDelegate | null {
  return (prisma as unknown as { systemSetting?: SettingDelegate }).systemSetting ?? null
}

export async function loadJobEnabledOverlay(): Promise<Map<string, string>> {
  const delegate = settings()
  if (!delegate) return new Map()
  const keys = AUTOMATION_JOB_CATALOG.map((job) => jobEnabledSettingKey(job.id))
  const rows = await delegate.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  })
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function isAutomationJobEnabled(jobId: AutomationJobId): Promise<boolean> {
  const overlay = await loadJobEnabledOverlay()
  return isJobEnabledByOverlay(jobId, overlay)
}

export async function setAutomationJobEnabled(input: {
  jobId: AutomationJobId
  enabled: boolean
  updatedBy: string
}): Promise<void> {
  const delegate = settings()
  if (!delegate) throw new Error("系统设置表不可用")
  const key = jobEnabledSettingKey(input.jobId)
  await delegate.upsert({
    where: { key },
    create: {
      key,
      value: input.enabled ? "true" : "false",
      type: "boolean",
      category: "automation",
      description: `自动化台账 ${input.jobId} 是否在任务体内执行（false=空转）`,
      updatedBy: input.updatedBy,
    },
    update: {
      value: input.enabled ? "true" : "false",
      updatedBy: input.updatedBy,
    },
  })
}
