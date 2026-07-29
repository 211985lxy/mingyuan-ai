import { env } from "@/env"
import {
  checkCustomerOutcomeFieldContract,
} from "@/lib/aim/customer-outcome-field-contract"
import {
  CustomerOutcomeProjectionError,
  upsertCustomerOutcomeProjection,
  type CustomerOutcomeProjectionInput,
  type CustomerOutcomeProjectionStorePort,
} from "@/lib/aim/customer-outcome-projection"
import {
  listBaseFields,
  type FeishuBaseFieldInfo,
} from "@/lib/integrations/feishu-base-publisher"
import {
  runLarkCliCommand,
  type LarkCliRunner,
} from "@/lib/integrations/lark-cli-runner"

const RECORD_LIMIT = 500

export interface CustomerOutcomeSyncConfig {
  baseToken: string
  tableId: string
  cliPath: string
}

export interface FeishuCustomerOutcomeRecord {
  recordId: string
  fields: Record<string, unknown>
}

export interface CustomerOutcomeSourceSnapshot {
  fields: FeishuBaseFieldInfo[]
  records: FeishuCustomerOutcomeRecord[]
}

export interface CustomerOutcomeSyncDb {
  clientProject: {
    findMany(args: {
      where: { id: { in: string[] } }
      select: { id: true }
      take: number
    }): Promise<Array<{ id: string }>>
  }
}

export interface CustomerOutcomeSyncResult {
  sourceRecords: number
  created: number
  updated: number
  skipped: number
  conflicts: number
  observedFieldTypes: Record<string, string>
  errors: Array<{ recordId: string; code: string }>
}

export function readCustomerOutcomeSyncConfig(): CustomerOutcomeSyncConfig {
  const baseToken = env.LARK_BASE_TOKEN?.trim()
  const tableId = env.LARK_CUSTOMER_OUTCOME_TABLE_ID?.trim()
  const cliPath = env.LARK_CLI_PATH?.trim()
  if (!baseToken) throw new Error("缺少 LARK_BASE_TOKEN")
  if (!tableId) throw new Error("缺少 LARK_CUSTOMER_OUTCOME_TABLE_ID")
  if (!cliPath) throw new Error("缺少 LARK_CLI_PATH")
  return { baseToken, tableId, cliPath }
}

function extractItems(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return []
  const root = payload as Record<string, unknown>
  const data =
    root.data && typeof root.data === "object"
      ? root.data as Record<string, unknown>
      : root
  const items = data.items ?? data.records
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"))
    : []
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    if (value.length !== 1) return null
    return scalar(value[0])
  }
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  for (const key of ["record_id", "recordId", "id", "text", "name", "value", "link"]) {
    const parsed = scalar(row[key])
    if (parsed) return parsed
  }
  return null
}

function date(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const raw = Number(value)
    const parsed = new Date(raw < 10_000_000_000 ? raw * 1000 : raw)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  return null
}

function decimal(value: unknown): string | null {
  const parsed = scalar(value)
  if (parsed == null || !Number.isFinite(Number(parsed))) return null
  return parsed
}

function reviewStatus(value: unknown): string | null {
  const parsed = scalar(value)?.toLowerCase()
  if (parsed === "待审核" || parsed === "pending") return "pending"
  if (parsed === "已通过" || parsed === "通过" || parsed === "approved") {
    return "approved"
  }
  if (parsed === "已拒绝" || parsed === "拒绝" || parsed === "rejected") {
    return "rejected"
  }
  return null
}

export async function loadCustomerOutcomeSource(input: {
  config: CustomerOutcomeSyncConfig
  runner?: LarkCliRunner
}): Promise<CustomerOutcomeSourceSnapshot> {
  const fields = await listBaseFields({
    baseToken: input.config.baseToken,
    tableId: input.config.tableId,
    cliPath: input.config.cliPath,
    runner: input.runner,
  })
  const contract = checkCustomerOutcomeFieldContract(
    fields.map((field) => field.name),
  )
  if (!contract.ok) {
    throw new Error(`飞书客户结果字段漂移：缺少 ${contract.missing.join("、")}`)
  }
  const payload = await runLarkCliCommand({
    domain: "base",
    command: "+record-list",
    args: [
      "--base-token", input.config.baseToken,
      "--table-id", input.config.tableId,
      "--limit", String(RECORD_LIMIT),
    ],
    cliPath: input.config.cliPath,
    runner: input.runner,
  })
  return {
    fields,
    records: extractItems(payload).map((row) => ({
      recordId: scalar(row.record_id ?? row.recordId) ?? "",
      fields:
        row.fields && typeof row.fields === "object"
          ? row.fields as Record<string, unknown>
          : {},
    })),
  }
}

function toProjectionInput(
  source: FeishuCustomerOutcomeRecord,
  tableId: string,
): CustomerOutcomeProjectionInput | null {
  const projectId = scalar(source.fields["项目ID"])
  const externalOutcomeId = scalar(source.fields["客户结果记录ID"])
  const metricCode = scalar(source.fields["指标编码"])
  const observedFrom = date(source.fields["观察开始"])
  const observedTo = date(source.fields["观察结束"])
  const status = reviewStatus(source.fields["审核状态"])
  if (
    !projectId
    || !externalOutcomeId
    || !metricCode
    || !observedFrom
    || !observedTo
    || !status
  ) return null
  return {
    projectId,
    externalOutcomeId,
    externalDealId: scalar(source.fields["成交记录ID"]),
    externalRecordId: source.recordId,
    externalTableId: tableId,
    metricCode,
    baseline: decimal(source.fields["基线"]),
    target: decimal(source.fields["目标"]),
    actual: decimal(source.fields["实际"]),
    unit: scalar(source.fields["单位"]),
    observedFrom,
    observedTo,
    evidenceRef: scalar(source.fields["证据引用"]),
    reviewStatus: status,
    reviewerRef: scalar(source.fields["审核人"]),
    reviewedAt: date(source.fields["审核时间"]),
  }
}

export async function syncCustomerOutcomeProjections(input: {
  snapshot: CustomerOutcomeSourceSnapshot
  tableId: string
  db: CustomerOutcomeSyncDb
  store: CustomerOutcomeProjectionStorePort
}): Promise<CustomerOutcomeSyncResult> {
  const projectIds = [...new Set(
    input.snapshot.records
      .map((source) => scalar(source.fields["项目ID"]))
      .filter((id): id is string => Boolean(id)),
  )].slice(0, RECORD_LIMIT)
  const projects = await input.db.clientProject.findMany({
    where: { id: { in: projectIds } },
    select: { id: true },
    take: RECORD_LIMIT,
  })
  const knownProjects = new Set(projects.map((row) => row.id))
  const result: CustomerOutcomeSyncResult = {
    sourceRecords: input.snapshot.records.length,
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    observedFieldTypes: Object.fromEntries(
      input.snapshot.fields.map((field) => [field.name, field.type]),
    ),
    errors: [],
  }
  for (const source of input.snapshot.records) {
    const draft = toProjectionInput(source, input.tableId)
    if (!draft || !knownProjects.has(draft.projectId)) {
      result.skipped += 1
      result.errors.push({
        recordId: source.recordId,
        code: draft ? "project_not_found" : "missing_required_evidence",
      })
      continue
    }
    try {
      const written = await upsertCustomerOutcomeProjection(draft, input.store)
      if (written.created) result.created += 1
      else result.updated += 1
    } catch (error) {
      result.skipped += 1
      const code = error instanceof CustomerOutcomeProjectionError
        ? error.code
        : "write_failed"
      if (code === "projection_conflict") result.conflicts += 1
      result.errors.push({ recordId: source.recordId, code })
    }
  }
  return result
}
