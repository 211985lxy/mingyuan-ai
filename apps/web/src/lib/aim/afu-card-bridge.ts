import type { WorkItemWorkflow } from "@/lib/aim-feishu-work-item"

export interface AfuCardWorkItemInput {
  topicId: string
  title: string
  workflow: WorkItemWorkflow
  aimProjectId: string
  inputSummary: string
  sourcePath?: string
  scheduledStart?: string
  scheduledEnd?: string
  calendarEventId?: string
  ownerOpenId?: string
}

export interface AfuCardWorkItemRecord {
  recordId: string
  fields: Record<string, unknown>
}

export interface AfuCardWorkItemPorts {
  list(): Promise<AfuCardWorkItemRecord[]>
  create(fields: Record<string, unknown>): Promise<AfuCardWorkItemRecord>
  update(recordId: string, fields: Record<string, unknown>): Promise<void>
}

export type AfuCardBridgeResult =
  | { ok: true; recordId: string; created: boolean; idempotent: boolean; fields: Record<string, unknown> }
  | { ok: false; error: string }

const WORKFLOWS = new Set<WorkItemWorkflow>(["内容增长", "销售诊断", "咨询交付"])

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function projectedFields(input: AfuCardWorkItemInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    "事项名称": input.title,
    "输入内容": input.inputSummary,
    "Markdown卡片ID": input.topicId,
    "Markdown卡片路径": input.sourcePath ?? "",
  }
  if (input.scheduledStart) fields["计划开始"] = input.scheduledStart
  if (input.scheduledEnd) fields["计划结束"] = input.scheduledEnd
  if (input.calendarEventId) fields["日历事件ID"] = input.calendarEventId
  return fields
}

function sameProjection(record: AfuCardWorkItemRecord, fields: Record<string, unknown>): boolean {
  return Object.entries(fields).every(([key, value]) => String(record.fields[key] ?? "").trim() === String(value ?? "").trim())
}

function validate(input: AfuCardWorkItemInput): string | null {
  if (!clean(input.topicId)) return "缺少 topicId。"
  if (!clean(input.title)) return "缺少 title。"
  if (!WORKFLOWS.has(input.workflow)) return "workflow 必须为 内容增长 / 销售诊断 / 咨询交付 之一。"
  if (!clean(input.aimProjectId)) return "缺少 aimProjectId。"
  if (input.scheduledStart && !clean(input.scheduledStart)) return "scheduledStart 不能为空字符串。"
  if (input.scheduledEnd && !clean(input.scheduledEnd)) return "scheduledEnd 不能为空字符串。"
  return null
}

/** 将 Afu 卡片投影到 AIM经营事项；不覆盖 Base 掌握的状态、负责人和结果字段。 */
export async function upsertAfuCardWorkItem(
  input: AfuCardWorkItemInput,
  ports: AfuCardWorkItemPorts,
): Promise<AfuCardBridgeResult> {
  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }

  const records = await ports.list()
  const matches = records.filter((record) => clean(record.fields["Markdown卡片ID"]) === input.topicId)
  if (matches.length > 1) return { ok: false, error: `Markdown 卡片 ${input.topicId} 对应多条经营事项，拒绝覆盖。` }

  const existing = matches[0]
  const baseIdentity = existing && {
    workflow: clean(existing.fields["工作流"]),
    aimProjectId: clean(existing.fields["AIM项目ID"]),
  }
  if (baseIdentity && (baseIdentity.workflow !== input.workflow || baseIdentity.aimProjectId !== input.aimProjectId)) {
    return { ok: false, error: `Markdown 卡片 ${input.topicId} 的工作流或 AIM项目ID 与 Base 已有记录冲突。` }
  }

  const fields = projectedFields(input)
  if (existing) {
    if (sameProjection(existing, fields)) {
      return { ok: true, recordId: existing.recordId, created: false, idempotent: true, fields: existing.fields }
    }
    await ports.update(existing.recordId, fields)
    return { ok: true, recordId: existing.recordId, created: false, idempotent: false, fields }
  }

  const created = await ports.create({
    ...fields,
    状态: "待处理",
    工作流: input.workflow,
    AIM项目ID: input.aimProjectId,
    ...(input.ownerOpenId ? { 负责人: [{ id: input.ownerOpenId }] } : {}),
  })
  return { ok: true, recordId: created.recordId, created: true, idempotent: false, fields: created.fields }
}

export function findAfuCardWorkItem(
  topicId: string,
  records: AfuCardWorkItemRecord[],
): AfuCardWorkItemRecord | null {
  const id = clean(topicId)
  if (!id) return null
  return records.find((record) => clean(record.fields["Markdown卡片ID"]) === id) ?? null
}
