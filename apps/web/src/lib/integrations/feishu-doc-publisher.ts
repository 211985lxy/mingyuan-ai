/**
 * 飞书文档发布器（WP-1.3）。
 *
 * 封装飞书 Doc 的创建、追加、回读操作。
 * 所有操作通过 lark-cli-runner 统一网关执行。
 */
import { runLarkCliCommand, type LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

export interface FeishuDocCreateInput {
  title: string
  content: string
  folderToken?: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuDocCreateResult {
  token: string
  url: string
  title: string
}

export interface FeishuDocUpdateInput {
  documentId: string
  content: string
  mode: "append" | "overwrite" | "replace"
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuDocFetchInput {
  documentId: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuDocFetchResult {
  token: string
  title: string
  content: string
}

/**
 * 创建飞书文档。
 * 使用 docs +create shortcut。
 */
export async function createFeishuDoc(input: FeishuDocCreateInput): Promise<FeishuDocCreateResult> {
  const args = ["--title", input.title, "--content", input.content]
  if (input.folderToken) {
    args.push("--folder-token", input.folderToken)
  }

  const result = await runLarkCliCommand({
    domain: "docs",
    command: "+create",
    args,
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const token = extractString(result, ["token", "document_id", "data.token", "data.document_id"])
  const url = extractString(result, ["url", "data.url"]) || buildDocUrl(token)

  if (!token) {
    throw new Error(`飞书文档创建成功但未返回 token：${JSON.stringify(result).slice(0, 200)}`)
  }

  return { token, url, title: input.title }
}

/**
 * 更新飞书文档（追加模式为主，保护人工编辑）。
 * 使用 docs +update shortcut。
 */
export async function updateFeishuDoc(input: FeishuDocUpdateInput): Promise<{ ok: true }> {
  const args = [
    "--document-id", input.documentId,
    "--content", input.content,
    "--mode", input.mode,
  ]

  await runLarkCliCommand({
    domain: "docs",
    command: "+update",
    args,
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  })

  return { ok: true }
}

/**
 * 回读飞书文档（验证创建/更新结果）。
 * 使用 docs +fetch shortcut。
 */
export async function fetchFeishuDoc(input: FeishuDocFetchInput): Promise<FeishuDocFetchResult> {
  const result = await runLarkCliCommand({
    domain: "docs",
    command: "+fetch",
    args: ["--document-id", input.documentId],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const token = extractString(result, ["token", "document_id", "data.token"]) || input.documentId
  const title = extractString(result, ["title", "data.title"]) || ""
  const content = extractString(result, ["content", "body", "data.content", "data.body"]) || ""

  return { token, title, content }
}

/**
 * 搜索飞书文档（幂等恢复：按标题或标记搜索已有文档）。
 * 使用 docs +search shortcut。
 */
export async function searchFeishuDoc(input: {
  query: string
  folderToken?: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}): Promise<Array<{ token: string; title: string; url: string }>> {
  const args = ["--query", input.query]
  if (input.folderToken) {
    args.push("--folder-token", input.folderToken)
  }

  const result = await runLarkCliCommand({
    domain: "docs",
    command: "+search",
    args,
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const items = extractArray(result, ["items", "data.items", "docs", "data.docs"])
  return items.map((item) => {
    const record = item as Record<string, unknown>
    const token = String(record.token ?? record.document_id ?? "")
    const title = String(record.title ?? "")
    const url = String(record.url ?? "") || buildDocUrl(token)
    return { token, title, url }
  }).filter((item) => item.token)
}

// ─── 辅助 ────────────────────────────────────────────────────────────────────

function buildDocUrl(token: string): string {
  return token ? `https://feishu.cn/docx/${token}` : ""
}

function extractString(obj: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split(".")
    let current: unknown = obj
    for (const part of parts) {
      if (current == null || typeof current !== "object") break
      current = (current as Record<string, unknown>)[part]
    }
    if (typeof current === "string" && current.trim()) return current.trim()
  }
  return ""
}

function extractArray(obj: Record<string, unknown>, paths: string[]): unknown[] {
  for (const path of paths) {
    const parts = path.split(".")
    let current: unknown = obj
    for (const part of parts) {
      if (current == null || typeof current !== "object") break
      current = (current as Record<string, unknown>)[part]
    }
    if (Array.isArray(current)) return current
  }
  return []
}
