/**
 * 飞书 Base 记录发布器（WP-1.3 / WP-4）。
 *
 * 封装 Base 记录的幂等写入：
 * - 写入前 +field-list 校验可写字段
 * - Formula/Lookup/系统字段只读
 * - AIM资产键 做应用层幂等
 * - 附件走 +record-upload-attachment
 * - 500 条以上串行分批（每批 100）
 */
import { runLarkCliCommand, type LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface FeishuBaseFieldInfo {
  name: string
  type: string
  writable: boolean
}

export interface FeishuBaseUpsertInput {
  baseToken: string
  tableId: string
  fields: Record<string, unknown>
  /** 幂等键字段名（默认 "AIM资产键"）。 */
  idempotencyField?: string
  /** 幂等键值。存在时先查后写，避免重复。 */
  idempotencyKey?: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuBaseUpsertResult {
  ok: true
  recordId: string
  created: boolean
}

export interface FeishuBaseBatchInput {
  baseToken: string
  tableId: string
  records: Array<Record<string, unknown>>
  idempotencyField?: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

// ─── 不可写字段类型 ──────────────────────────────────────────────────────────

const READONLY_FIELD_TYPES = new Set([
  "formula",
  "lookup",
  "auto_number",
  "created_time",
  "modified_time",
  "created_by",
  "modified_by",
])

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 获取表字段列表并标记可写性。
 */
export async function listBaseFields(input: {
  baseToken: string
  tableId: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}): Promise<FeishuBaseFieldInfo[]> {
  const result = await runLarkCliCommand({
    domain: "base",
    command: "+field-list",
    args: ["--base-token", input.baseToken, "--table-id", input.tableId, "--limit", "200"],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const items = extractFieldItems(result)
  return items.map((item) => {
    const name = String(item.field_name ?? item.name ?? "")
    const type = String(item.type ?? "").toLowerCase()
    return {
      name,
      type,
      writable: !READONLY_FIELD_TYPES.has(type),
    }
  }).filter((f) => f.name)
}

/**
 * 过滤掉不可写字段，只保留可写存储字段。
 */
export function filterWritableFields(
  fields: Record<string, unknown>,
  fieldInfos: FeishuBaseFieldInfo[],
): Record<string, unknown> {
  const writableNames = new Set(fieldInfos.filter((f) => f.writable).map((f) => f.name))
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (writableNames.has(key)) {
      filtered[key] = value
    }
  }
  return filtered
}

/**
 * 幂等写入单条 Base 记录。
 * 有 idempotencyKey 时先查是否已存在，存在则更新，不存在则创建。
 */
export async function upsertBaseRecord(input: FeishuBaseUpsertInput): Promise<FeishuBaseUpsertResult> {
  const idempotencyField = input.idempotencyField ?? "AIM资产键"

  // 有幂等键时先查
  if (input.idempotencyKey) {
    const existing = await findRecordByIdempotencyKey({
      baseToken: input.baseToken,
      tableId: input.tableId,
      field: idempotencyField,
      value: input.idempotencyKey,
      identity: input.identity,
      runner: input.runner,
      cliPath: input.cliPath,
    })
    if (existing) {
      // 更新已有记录
      await runLarkCliCommand({
        domain: "base",
        command: "+record-upsert",
        args: [
          "--base-token", input.baseToken,
          "--table-id", input.tableId,
          "--record-id", existing,
          "--json", JSON.stringify(input.fields),
        ],
        identity: input.identity,
        runner: input.runner,
        cliPath: input.cliPath,
      })
      return { ok: true, recordId: existing, created: false }
    }
  }

  // 创建新记录（带幂等键字段）
  const fieldsWithKey = input.idempotencyKey
    ? { ...input.fields, [idempotencyField]: input.idempotencyKey }
    : input.fields

  const result = await runLarkCliCommand({
    domain: "base",
    command: "+record-upsert",
    args: [
      "--base-token", input.baseToken,
      "--table-id", input.tableId,
      "--json", JSON.stringify(fieldsWithKey),
    ],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const recordId = extractRecordId(result)
  return { ok: true, recordId, created: true }
}

/**
 * 批量写入 Base 记录（串行分批，每批 100 条）。
 */
export async function batchUpsertBaseRecords(input: FeishuBaseBatchInput): Promise<{
  ok: true
  total: number
  created: number
  updated: number
}> {
  const BATCH_SIZE = 100
  let created = 0
  let updated = 0

  for (let i = 0; i < input.records.length; i += BATCH_SIZE) {
    const batch = input.records.slice(i, i + BATCH_SIZE)
    for (const fields of batch) {
      const idempotencyKey = input.idempotencyField
        ? String(fields[input.idempotencyField] ?? "")
        : undefined
      const result = await upsertBaseRecord({
        baseToken: input.baseToken,
        tableId: input.tableId,
        fields,
        idempotencyField: input.idempotencyField,
        idempotencyKey: idempotencyKey || undefined,
        identity: input.identity,
        runner: input.runner,
        cliPath: input.cliPath,
      })
      if (result.created) created++
      else updated++
    }
  }

  return { ok: true, total: input.records.length, created, updated }
}

// ─── 辅助 ────────────────────────────────────────────────────────────────────

async function findRecordByIdempotencyKey(input: {
  baseToken: string
  tableId: string
  field: string
  value: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}): Promise<string | null> {
  try {
    const result = await runLarkCliCommand({
      domain: "base",
      command: "+record-list",
      args: [
        "--base-token", input.baseToken,
        "--table-id", input.tableId,
        "--filter", `${input.field}="${input.value}"`,
        "--limit", "1",
      ],
      identity: input.identity,
      runner: input.runner,
      cliPath: input.cliPath,
    }) as Record<string, unknown>

    const records = extractRecords(result)
    if (records.length > 0) {
      return String(records[0].record_id ?? "")
    }
    return null
  } catch {
    // 查询失败不阻断创建
    return null
  }
}

function extractRecordId(result: Record<string, unknown>): string {
  const direct = result.record_id ?? result.recordId
  if (typeof direct === "string") return direct
  const data = result.data as Record<string, unknown> | undefined
  if (data) {
    const nested = data.record_id ?? data.recordId
    if (typeof nested === "string") return nested
  }
  const record = result.record as Record<string, unknown> | undefined
  if (record?.record_id) return String(record.record_id)
  return ""
}

function extractFieldItems(result: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = result.data as Record<string, unknown> | undefined
  const items = data?.items ?? data?.fields ?? result.items ?? result.fields
  return Array.isArray(items) ? items : []
}

function extractRecords(result: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = result.data as Record<string, unknown> | undefined
  const items = data?.items ?? data?.records ?? result.items ?? result.records
  return Array.isArray(items) ? items : []
}
