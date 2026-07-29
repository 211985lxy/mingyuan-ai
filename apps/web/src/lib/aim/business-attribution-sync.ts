import { env } from "@/env"
import {
  checkBusinessAttributionFieldContract,
} from "@/lib/aim/business-attribution-field-contract"
import {
  AttributionConflictError,
  upsertOutcomeAttribution,
  type OutcomeAttributionStorePort,
  type UpsertOutcomeAttributionInput,
} from "@/lib/aim/outcome-attribution"
import {
  listBaseFields,
  type FeishuBaseFieldInfo,
} from "@/lib/integrations/feishu-base-publisher"
import {
  runLarkCliCommand,
  type LarkCliRunner,
} from "@/lib/integrations/lark-cli-runner"

const RECORD_LIMIT = 500

export interface BusinessAttributionSyncConfig {
  baseToken: string
  tableId: string
  cliPath?: string
}

export interface FeishuBusinessAttributionRecord {
  recordId: string
  fields: Record<string, unknown>
  createdAt: Date | null
}

export interface BusinessAttributionSourceSnapshot {
  fields: FeishuBaseFieldInfo[]
  records: FeishuBusinessAttributionRecord[]
}

export interface BusinessAttributionSyncDb {
  aimGeneration: {
    findMany(args: {
      where: { id: { in: string[] } }
      select: { id: true; userId: true }
      take: number
    }): Promise<Array<{ id: string; userId: string }>>
  }
}

export interface BusinessAttributionSyncResult {
  sourceRecords: number
  created: number
  updated: number
  skipped: number
  conflicts: number
  missingFields: string[]
  observedFieldTypes: Record<string, string>
  errors: Array<{ recordId: string; code: string }>
}

export function readBusinessAttributionSyncConfig(): BusinessAttributionSyncConfig {
  const baseToken = env.LARK_BASE_TOKEN?.trim()
  const tableId = env.LARK_BUSINESS_ATTRIBUTION_TABLE_ID?.trim()
  const cliPath = env.LARK_CLI_PATH?.trim()
  if (!baseToken) throw new Error("缺少 LARK_BASE_TOKEN")
  if (!tableId) throw new Error("缺少 LARK_BUSINESS_ATTRIBUTION_TABLE_ID")
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

function extractScalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    if (value.length !== 1) return null
    return extractScalar(value[0])
  }
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  for (const key of ["record_id", "recordId", "id", "text", "name", "value"]) {
    const parsed = extractScalar(row[key])
    if (parsed) return parsed
  }
  return null
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const raw = Number(value)
    const date = new Date(raw < 10_000_000_000 ? raw * 1000 : raw)
    return Number.isFinite(date.getTime()) ? date : null
  }
  if (typeof value === "string") {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  return null
}

function parseSourceRecord(
  row: Record<string, unknown>,
): FeishuBusinessAttributionRecord {
  const fields =
    row.fields && typeof row.fields === "object"
      ? row.fields as Record<string, unknown>
      : {}
  return {
    recordId: extractScalar(row.record_id ?? row.recordId) ?? "",
    fields,
    createdAt:
      parseDate(fields["发生时间"])
      ?? parseDate(row.created_time ?? row.createdAt),
  }
}

export async function loadBusinessAttributionSource(input: {
  config: BusinessAttributionSyncConfig
  runner?: LarkCliRunner
}): Promise<BusinessAttributionSourceSnapshot> {
  const fields = await listBaseFields({
    baseToken: input.config.baseToken,
    tableId: input.config.tableId,
    cliPath: input.config.cliPath,
    runner: input.runner,
  })
  const contract = checkBusinessAttributionFieldContract(fields.map((field) => field.name))
  if (!contract.ok) {
    throw new Error(`飞书经营归因字段漂移：缺少 ${contract.missing.join("、")}`)
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
    records: extractItems(payload).map(parseSourceRecord),
  }
}

function toUpsertInput(
  record: FeishuBusinessAttributionRecord,
  tableId: string,
  userId: string,
): UpsertOutcomeAttributionInput | null {
  const generationId = extractScalar(record.fields["AIM生成ID"])
  const externalLeadId = extractScalar(record.fields["线索记录ID"])
  if (!generationId || !externalLeadId || !record.createdAt) return null
  return {
    userId,
    generationId,
    externalLeadId,
    externalAppointmentId: extractScalar(record.fields["预约记录ID"]),
    externalDealId: extractScalar(record.fields["成交记录ID"]),
    externalPaymentId: extractScalar(record.fields["回款记录ID"]),
    externalRecordId: record.recordId || null,
    externalTableId: tableId,
    externalSourceContentId: extractScalar(record.fields["来源内容ID"]),
    externalAttributionConfirmer: extractScalar(record.fields["归因确认人"]),
    declaredMethod: extractScalar(record.fields["归因方式"]),
    occurredAt: record.createdAt,
  }
}

export async function syncBusinessAttributions(input: {
  snapshot: BusinessAttributionSourceSnapshot
  tableId: string
  db: BusinessAttributionSyncDb
  store: OutcomeAttributionStorePort
}): Promise<BusinessAttributionSyncResult> {
  const generationIds = [...new Set(
    input.snapshot.records
      .map((record) => extractScalar(record.fields["AIM生成ID"]))
      .filter((id): id is string => Boolean(id)),
  )].slice(0, RECORD_LIMIT)
  const generations = await input.db.aimGeneration.findMany({
    where: { id: { in: generationIds } },
    select: { id: true, userId: true },
    take: RECORD_LIMIT,
  })
  const userByGeneration = new Map(generations.map((row) => [row.id, row.userId]))
  const result: BusinessAttributionSyncResult = {
    sourceRecords: input.snapshot.records.length,
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    missingFields: [],
    observedFieldTypes: Object.fromEntries(
      input.snapshot.fields.map((field) => [field.name, field.type]),
    ),
    errors: [],
  }
  for (const source of input.snapshot.records) {
    const generationId = extractScalar(source.fields["AIM生成ID"])
    const userId = generationId ? userByGeneration.get(generationId) : undefined
    const draft = userId
      ? toUpsertInput(source, input.tableId, userId)
      : null
    if (!draft) {
      result.skipped += 1
      result.errors.push({
        recordId: source.recordId,
        code: userId ? "missing_required_evidence" : "generation_not_found",
      })
      continue
    }
    try {
      const written = await upsertOutcomeAttribution(draft, input.store)
      if (written.created) result.created += 1
      else result.updated += 1
    } catch (error) {
      result.skipped += 1
      if (error instanceof AttributionConflictError) result.conflicts += 1
      result.errors.push({
        recordId: source.recordId,
        code: error instanceof AttributionConflictError ? "attribution_conflict" : "write_failed",
      })
    }
  }
  return result
}
