import { execFile } from "node:child_process"
import { promisify } from "node:util"

// Embedding hook type — we import dynamically to avoid circular deps
type EnsureEmbeddingFn = (entryId: string) => Promise<void>
let _ensureEmbedding: EnsureEmbeddingFn | null = null

/** Optional: register an embedding hook that runs after entry create/update */
export function setEmbeddingHook(fn: EnsureEmbeddingFn): void {
  _ensureEmbedding = fn
}

function fireEmbedding(entryId: string): void {
  _ensureEmbedding?.(entryId).catch(() => {})
}

export type LarkTableType = "topic_review" | "project_management" | "data_archive"
export type LarkResultType = "topic" | "script" | "positioning" | "moments_copy"
type LarkCommand = "+table-get" | "+field-list" | "+record-list" | "+record-get" | "+record-upsert"

type RunCommand = (command: LarkCommand, args: string[]) => Promise<unknown>

type EnvLike = Record<string, string | undefined>

type LarkConfig = {
  cliPath?: string
  baseToken: string
  tableId: string
}

type DbLike = {
  clientProject: {
    findFirst(args: unknown): Promise<{ id: string; name?: string | null } | null>
  }
  knowledgeEntry: {
    findFirst(args: unknown): Promise<{ id: string } | null>
    update(args: unknown): Promise<{ id: string } & Record<string, unknown>>
    create(args: unknown): Promise<{ id: string } & Record<string, unknown>>
  }
  aimGeneration?: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>
  }
  topicSelection?: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>
  }
}

const execFileAsync = promisify(execFile)

const ALLOWED_COMMANDS = new Set<LarkCommand>([
  "+table-get",
  "+field-list",
  "+record-list",
  "+record-get",
  "+record-upsert",
])

// 不再硬编码开发者本机绝对路径(生产会 ENOENT)。LARK_CLI_PATH 必须由环境变量提供。
function requireLarkCliPath(env: EnvLike = process.env): string {
  const p = env.LARK_CLI_PATH?.trim()
  if (!p) {
    throw new Error("缺少 LARK_CLI_PATH:请在环境变量中配置 lark-cli 可执行文件的绝对路径")
  }
  return p
}

const TABLE_ENV_KEYS: Record<LarkTableType, string> = {
  topic_review: "LARK_TOPIC_TABLE_ID",
  project_management: "LARK_PROJECT_TABLE_ID",
  data_archive: "LARK_DATA_TABLE_ID",
}

const REQUIRED_FIELDS = ["标题", "内容", "类型"]

export function readLarkBaseConfig(env: EnvLike, tableType: LarkTableType): LarkConfig {
  const baseToken = env.LARK_BASE_TOKEN?.trim()
  if (!baseToken) throw new Error("缺少 LARK_BASE_TOKEN")

  const tableKey = TABLE_ENV_KEYS[tableType]
  const tableId = env[tableKey]?.trim()
  if (!tableId) throw new Error(`缺少 ${tableKey}`)

  return {
    cliPath: env.LARK_CLI_PATH?.trim() || undefined,
    baseToken,
    tableId,
  }
}

function readResultTableConfig(env: EnvLike, resultType: LarkResultType): LarkConfig {
  const baseToken = env.LARK_BASE_TOKEN?.trim()
  if (!baseToken) throw new Error("缺少 LARK_BASE_TOKEN")

  const tableKey = resultType === "topic" ? "LARK_TOPIC_TABLE_ID" : "LARK_RESULT_TABLE_ID"
  const tableId = env[tableKey]?.trim()
  if (!tableId) throw new Error(`缺少 ${tableKey}`)

  return {
    cliPath: env.LARK_CLI_PATH?.trim() || undefined,
    baseToken,
    tableId,
  }
}

export function mapLarkKnowledgeCategory(value: unknown): string {
  const text = String(value || "")
  if (/热点/.test(text)) return "hot_topic"
  if (/竞品|对标/.test(text)) return "benchmark_reference"
  if (/用户|洞察|问题/.test(text)) return "user_insight"
  if (/定位/.test(text)) return "positioning_material"
  if (/私域|朋友圈/.test(text)) return "private_domain_material"
  return "daily_inspiration"
}

export async function runLarkBaseCommand(
  command: string,
  args: string[],
  options: {
    cliPath?: string
    identity?: "user" | "bot"
    runner?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
  } = {},
): Promise<unknown> {
  if (!ALLOWED_COMMANDS.has(command as LarkCommand)) {
    throw new Error(`不允许执行飞书 Base 命令：${command}`)
  }

  const cliPath = options.cliPath || (options.runner ? "/mock/lark-cli" : requireLarkCliPath())
  // 默认 runner 加 15s 超时 + 10MB maxBuffer,防止 lark-cli 卡死或大表 stdout 溢出
  const runner =
    options.runner ||
    ((file, argv) =>
      execFileAsync(file, argv, {
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024,
      }))
  const identityArgs = options.identity ? ["--as", options.identity] : []
  const { stdout } = await runner(cliPath, [
    "base", command, ...args, ...identityArgs, "--format", "json",
  ])
  const text = stdout.trim()
  return text ? JSON.parse(text) : {}
}

function asRecordList(payload: unknown): Array<{ record_id?: string; fields?: Record<string, unknown> }> {
  if (!payload || typeof payload !== "object") return []
  const record = payload as Record<string, unknown>
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : record
  if (Array.isArray(data.data) && Array.isArray(data.fields) && Array.isArray(data.record_id_list)) {
    const fieldNames = data.fields.map((field) => String(field))
    const recordIds = data.record_id_list
    return data.data.flatMap((row, index) => {
      if (!Array.isArray(row) || typeof recordIds[index] !== "string") return []
      return [{
        record_id: recordIds[index] as string,
        fields: Object.fromEntries(fieldNames.map((name, fieldIndex) => [name, row[fieldIndex]])),
      }]
    })
  }
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.records)
      ? data.records
      : []
  return items.filter((item): item is { record_id?: string; fields?: Record<string, unknown> } => !!item && typeof item === "object")
}

function asFieldNames(payload: unknown): string[] {
  return asRecordList(payload).map((item) => {
    const fields = item as Record<string, unknown>
    return String(fields.field_name || fields.name || "")
  }).filter(Boolean)
}

function textField(fields: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = fields[name]
    if (Array.isArray(value)) return value.map((item) => String(item)).join("、").trim()
    if (value != null) return String(value).trim()
  }
  return ""
}

function tagField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === "string") return value.split(/[,\s，、]+/).map((item) => item.trim()).filter(Boolean)
  return []
}

function entryFromRecord(item: { record_id?: string; fields?: Record<string, unknown> }) {
  const fields = item.fields || {}
  const title = textField(fields, ["标题", "Title", "title"]) || item.record_id || "飞书素材"
  const content = textField(fields, ["内容", "正文", "Content", "content"]) || title
  const type = textField(fields, ["类型", "分类", "Type", "type"])
  const tags = tagField(fields["标签"] || fields.tags)
  return {
    recordId: item.record_id || title,
    title,
    content,
    type,
    tags,
    category: mapLarkKnowledgeCategory(type),
  }
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function narrowRecordResponse(
  payload: unknown,
): { recordId: string; fields: Record<string, unknown> } | null {
  const root = asObjectRecord(payload)
  if (!root) return null

  const matrix = asObjectRecord(root.data)
  const rows = matrix?.data
  const fieldNames = matrix?.fields
  const recordIds = matrix?.record_id_list
  if (
    Array.isArray(rows) && Array.isArray(rows[0]) &&
    Array.isArray(fieldNames) && Array.isArray(recordIds) &&
    typeof recordIds[0] === "string"
  ) {
    const fields = Object.fromEntries(
      fieldNames.map((name, index) => [String(name), rows[0][index]]),
    )
    return { recordId: recordIds[0], fields }
  }

  const record = asObjectRecord(root.record) || root
  const fields = asObjectRecord(record.fields)
  if (typeof record.record_id !== "string" || !fields) return null
  return { recordId: record.record_id, fields }
}

export async function getLarkBaseRecord(input: {
  baseToken: string
  tableId: string
  recordId: string
  cliPath?: string
  identity?: "user" | "bot"
  runCommand?: RunCommand
}): Promise<{ recordId: string; fields: Record<string, unknown> }> {
  const runCommand = input.runCommand ||
    ((command, args) => runLarkBaseCommand(command, args, {
      cliPath: input.cliPath,
      identity: input.identity,
    }))

  const payload = await runCommand("+record-get", [
    "--base-token", input.baseToken,
    "--table-id", input.tableId,
    "--record-id", input.recordId,
  ])

  const narrowed = narrowRecordResponse(payload)
  if (!narrowed) {
    throw new Error(`飞书记录 ${input.recordId} 不存在`)
  }
  return narrowed
}

export async function updateLarkBaseRecord(input: {
  baseToken: string
  tableId: string
  recordId: string
  fields: Record<string, unknown>
  cliPath?: string
  identity?: "user" | "bot"
  runCommand?: RunCommand
}): Promise<{ ok: true; result: unknown }> {
  const runCommand = input.runCommand ||
    ((command, args) => runLarkBaseCommand(command, args, {
      cliPath: input.cliPath,
      identity: input.identity,
    }))

  const payload = await runCommand("+record-upsert", [
    "--base-token", input.baseToken,
    "--table-id", input.tableId,
    "--record-id", input.recordId,
    "--json", JSON.stringify(input.fields),
  ])

  return { ok: true as const, result: payload }
}

/**
 * 列出表内记录（record 级，供 WP-8 待处理扫描等场景使用）。
 * 返回 { recordId, fields } 形态；不做状态过滤，过滤由调用方负责。
 */
export async function listLarkBaseRecords(input: {
  baseToken: string
  tableId: string
  limit?: number
  offset?: number
  cliPath?: string
  identity?: "user" | "bot"
  runCommand?: RunCommand
}): Promise<Array<{ recordId: string; fields: Record<string, unknown> }>> {
  const runCommand = input.runCommand ||
    ((command, args) => runLarkBaseCommand(command, args, {
      cliPath: input.cliPath,
      identity: input.identity,
    }))

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)
  const payload = await runCommand("+record-list", [
    "--base-token", input.baseToken,
    "--table-id", input.tableId,
    "--offset", String(offset),
    "--limit", String(limit),
  ])

  return asRecordList(payload)
    .filter((item) => typeof item.record_id === "string" && item.record_id)
    .map((item) => ({
      recordId: item.record_id as string,
      fields: (item.fields ?? {}) as Record<string, unknown>,
    }))
}

async function ensureProject(db: DbLike, userId: string, projectId: string) {
  const project = await db.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true, name: true },
  })
  if (!project) throw new Error("IP营销全案不存在或已归档")
  return project
}

async function validateFields(runCommand: RunCommand, config: LarkConfig) {
  const payload = await runCommand("+field-list", [
    "--base-token", config.baseToken,
    "--table-id", config.tableId,
    "--limit", "100",
  ])
  const names = asFieldNames(payload)
  const missing = REQUIRED_FIELDS.filter((field) => !names.includes(field))
  if (names.length > 0 && missing.length > 0) {
    throw new Error(`飞书表缺少字段：${missing.join("、")}`)
  }
}

export async function importLarkBaseKnowledge(input: {
  userId: string
  projectId: string
  tableType: LarkTableType
  env?: EnvLike
  db: DbLike
  runCommand?: RunCommand
}) {
  const env = input.env || process.env
  const config = readLarkBaseConfig(env, input.tableType)
  const runCommand = input.runCommand || ((command, args) => runLarkBaseCommand(command, args, { cliPath: config.cliPath }))

  await ensureProject(input.db, input.userId, input.projectId)
  await validateFields(runCommand, config)

  const payload = await runCommand("+record-list", [
    "--base-token", config.baseToken,
    "--table-id", config.tableId,
    "--offset", "0",
    "--limit", "100",
  ])

  let created = 0
  let updated = 0
  const entries: unknown[] = []

  for (const item of asRecordList(payload).map(entryFromRecord)) {
    const tags = ["lark_base", input.tableType, item.recordId, ...item.tags]
    const existing = await input.db.knowledgeEntry.findFirst({
      where: {
        userId: input.userId,
        projectId: input.projectId,
        title: item.title,
        sourceType: "import",
      },
      select: { id: true },
    })
    const data = {
      userId: input.userId,
      projectId: input.projectId,
      category: item.category,
      title: item.title,
      content: item.content,
      tags,
      sourceType: "import",
      status: "active",
    }

    let entryId: string
    if (existing) {
      const updatedEntry = await input.db.knowledgeEntry.update({ where: { id: existing.id }, data })
      entryId = updatedEntry.id as string
      entries.push(updatedEntry)
      updated++
    } else {
      const createdEntry = await input.db.knowledgeEntry.create({ data })
      entryId = createdEntry.id as string
      entries.push(createdEntry)
      created++
    }
    fireEmbedding(entryId)
  }

  return { created, updated, entries }
}

function summarizeAimGeneration(record: Record<string, unknown>) {
  return String(
    record.videoScript ||
    record.rawCopy ||
    record.momentsPost ||
    record.wechatArticle ||
    record.communityMessage ||
    record.shootingBrief ||
    record.rawInput ||
    "",
  ).slice(0, 2000)
}

export async function exportLarkBaseResult(input: {
  userId: string
  projectId: string
  resultType: LarkResultType
  resultId: string
  env?: EnvLike
  db: DbLike
  runCommand?: RunCommand
}) {
  const env = input.env || process.env
  const config = readResultTableConfig(env, input.resultType)
  const runCommand = input.runCommand || ((command, args) => runLarkBaseCommand(command, args, { cliPath: config.cliPath }))
  const project = await ensureProject(input.db, input.userId, input.projectId)

  let fields: Record<string, unknown>
  if (input.resultType === "topic") {
    const selection = await input.db.topicSelection?.findFirst({
      where: { id: input.resultId, userId: input.userId },
      select: { id: true, candidates: true, selectedIndex: true },
    })
    if (!selection) throw new Error("选题结果不存在")
    const candidates = Array.isArray(selection.candidates) ? selection.candidates as Record<string, unknown>[] : []
    const selectedIndex = typeof selection.selectedIndex === "number" ? selection.selectedIndex : 0
    const card = candidates[selectedIndex] || candidates[0] || {}
    fields = {
      "标题": String(card.title || "AIM 选题"),
      "内容": String(card.rationale || card.reason || ""),
      "类型": "选题",
      "状态": "已采用",
      "AIM结果ID": input.resultId,
      "项目名称": project.name || input.projectId,
    }
  } else {
    const generation = await input.db.aimGeneration?.findFirst({
      where: { id: input.resultId, userId: input.userId, projectId: input.projectId },
    })
    if (!generation) throw new Error("AIM 生成结果不存在")
    fields = {
      "标题": String(generation.topicTitle || generation.rawInput || "AIM 内容").slice(0, 80),
      "内容": summarizeAimGeneration(generation),
      "类型": input.resultType,
      "状态": "已生成",
      "AIM结果ID": input.resultId,
      "项目名称": project.name || input.projectId,
    }
  }

  const payload = await runCommand("+record-upsert", [
    "--base-token", config.baseToken,
    "--table-id", config.tableId,
    "--json", JSON.stringify(fields),
  ])

  return { ok: true as const, result: payload }
}
