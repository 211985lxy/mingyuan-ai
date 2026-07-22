/**
 * 飞书 Sheets 发布器（WP-1.3 / WP-4）。
 *
 * 封装 Sheets 的创建、写入、追加和回读操作。
 * - +create 创建并返回 URL
 * - +write 写固定区域
 * - +append 追加数据
 * - +read 回读验证
 * - 不清空或覆盖人工维护的工作表
 */
import { runLarkCliCommand, type LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface FeishuSheetCreateInput {
  title: string
  folderToken?: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuSheetCreateResult {
  token: string
  url: string
  title: string
  sheetId: string
}

export interface FeishuSheetWriteInput {
  spreadsheetToken: string
  /** 工作表 ID 或标题（如 "Sheet1"）。 */
  sheetId: string
  /** 写入范围（如 "A1:D10"）。 */
  range: string
  /** 二维数组数据。 */
  values: unknown[][]
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuSheetAppendInput {
  spreadsheetToken: string
  sheetId: string
  /** 追加起始范围（如 "A1"）。 */
  range: string
  values: unknown[][]
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuSheetReadInput {
  spreadsheetToken: string
  sheetId: string
  range: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuSheetReadResult {
  values: unknown[][]
  rowCount: number
  colCount: number
}

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 创建飞书电子表格。
 */
export async function createFeishuSheet(input: FeishuSheetCreateInput): Promise<FeishuSheetCreateResult> {
  const args = ["--title", input.title]
  if (input.folderToken) {
    args.push("--folder-token", input.folderToken)
  }

  const result = await runLarkCliCommand({
    domain: "sheets",
    command: "+create",
    args,
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const token = extractStr(result, ["token", "spreadsheet_token", "data.token", "data.spreadsheet_token"])
  const url = extractStr(result, ["url", "data.url"]) || buildSheetUrl(token)
  const sheetId = extractStr(result, ["sheet_id", "sheetId", "data.sheet_id", "data.sheets.0.sheet_id"]) || "Sheet1"

  if (!token) {
    throw new Error(`飞书 Sheets 创建成功但未返回 token：${JSON.stringify(result).slice(0, 200)}`)
  }

  return { token, url, title: input.title, sheetId }
}

/**
 * 写入固定区域（覆盖指定范围）。
 * 注意：只写指定范围，不清空整个工作表。
 */
export async function writeFeishuSheet(input: FeishuSheetWriteInput): Promise<{ ok: true }> {
  await runLarkCliCommand({
    domain: "sheets",
    command: "+write",
    args: [
      "--spreadsheet-token", input.spreadsheetToken,
      "--sheet-id", input.sheetId,
      "--range", input.range,
      "--json", JSON.stringify(input.values),
    ],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  })

  return { ok: true }
}

/**
 * 追加数据到工作表末尾。
 */
export async function appendFeishuSheet(input: FeishuSheetAppendInput): Promise<{ ok: true }> {
  await runLarkCliCommand({
    domain: "sheets",
    command: "+append",
    args: [
      "--spreadsheet-token", input.spreadsheetToken,
      "--sheet-id", input.sheetId,
      "--range", input.range,
      "--json", JSON.stringify(input.values),
    ],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  })

  return { ok: true }
}

/**
 * 回读指定区域（验证写入结果）。
 */
export async function readFeishuSheet(input: FeishuSheetReadInput): Promise<FeishuSheetReadResult> {
  const result = await runLarkCliCommand({
    domain: "sheets",
    command: "+read",
    args: [
      "--spreadsheet-token", input.spreadsheetToken,
      "--sheet-id", input.sheetId,
      "--range", input.range,
    ],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const values = extractValues(result)
  return {
    values,
    rowCount: values.length,
    colCount: values.length > 0 ? Math.max(...values.map((row) => row.length)) : 0,
  }
}

// ─── 辅助 ────────────────────────────────────────────────────────────────────

function buildSheetUrl(token: string): string {
  return token ? `https://feishu.cn/sheets/${token}` : ""
}

function extractStr(obj: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split(".")
    let current: unknown = obj
    for (const part of parts) {
      if (current == null || typeof current !== "object") break
      if (Array.isArray(current)) {
        const idx = Number(part)
        current = Number.isInteger(idx) ? current[idx] : undefined
      } else {
        current = (current as Record<string, unknown>)[part]
      }
    }
    if (typeof current === "string" && current.trim()) return current.trim()
  }
  return ""
}

function extractValues(result: Record<string, unknown>): unknown[][] {
  const data = result.data as Record<string, unknown> | undefined
  const raw = data?.values ?? result.values
  if (Array.isArray(raw)) {
    return raw.filter((row): row is unknown[] => Array.isArray(row))
  }
  return []
}
