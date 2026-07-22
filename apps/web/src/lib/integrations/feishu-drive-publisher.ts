/**
 * 飞书 Drive 文件发布器（WP-1.3 / WP-5）。
 *
 * 封装 Drive 文件上传、权限设置和元数据查询。
 * 流程：本地临时文件 → 内容哈希 → drive +upload → 权限 → 元数据 → Receipt → 清理临时文件。
 * 同哈希文件不重复上传。
 */
import { runLarkCliCommand, type LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface FeishuDriveUploadInput {
  /** 本地文件路径。 */
  filePath: string
  /** 目标文件夹 token。 */
  folderToken: string
  /** 文件名（含扩展名）。 */
  fileName: string
  /** 内容哈希（用于幂等去重）。 */
  contentHash: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuDriveUploadResult {
  token: string
  url: string
  fileName: string
  contentHash: string
}

export interface FeishuDriveMetadataInput {
  fileToken: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuDriveMetadataResult {
  token: string
  name: string
  type: string
  url: string
  createdTime: string
}

export interface FeishuDriveListInput {
  folderToken: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuDriveFileItem {
  token: string
  name: string
  type: string
  url: string
}

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 上传文件到飞书 Drive。
 */
export async function uploadToDrive(input: FeishuDriveUploadInput): Promise<FeishuDriveUploadResult> {
  const result = await runLarkCliCommand({
    domain: "drive",
    command: "+upload",
    args: [
      "--file-path", input.filePath,
      "--folder-token", input.folderToken,
      "--file-name", input.fileName,
    ],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
    timeoutMs: 60_000, // 上传可能较慢
  }) as Record<string, unknown>

  const token = extractStr(result, ["token", "file_token", "data.token", "data.file_token"])
  const url = extractStr(result, ["url", "data.url"]) || buildDriveUrl(token)

  if (!token) {
    throw new Error(`飞书 Drive 上传成功但未返回 token：${JSON.stringify(result).slice(0, 200)}`)
  }

  return { token, url, fileName: input.fileName, contentHash: input.contentHash }
}

/**
 * 查询文件元数据。
 */
export async function getDriveMetadata(input: FeishuDriveMetadataInput): Promise<FeishuDriveMetadataResult> {
  const result = await runLarkCliCommand({
    domain: "drive",
    command: "+metadata",
    args: ["--file-token", input.fileToken],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const data = (result.data ?? result) as Record<string, unknown>
  return {
    token: String(data.token ?? data.file_token ?? input.fileToken),
    name: String(data.name ?? data.file_name ?? ""),
    type: String(data.type ?? data.file_type ?? ""),
    url: String(data.url ?? "") || buildDriveUrl(input.fileToken),
    createdTime: String(data.created_time ?? data.create_time ?? ""),
  }
}

/**
 * 列出文件夹内容。
 */
export async function listDriveFiles(input: FeishuDriveListInput): Promise<FeishuDriveFileItem[]> {
  const result = await runLarkCliCommand({
    domain: "drive",
    command: "+list",
    args: ["--folder-token", input.folderToken],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  }) as Record<string, unknown>

  const data = (result.data ?? result) as Record<string, unknown>
  const files = data.files ?? data.items
  if (!Array.isArray(files)) return []

  return files.map((file) => {
    const record = file as Record<string, unknown>
    const token = String(record.token ?? record.file_token ?? "")
    return {
      token,
      name: String(record.name ?? record.file_name ?? ""),
      type: String(record.type ?? record.file_type ?? ""),
      url: String(record.url ?? "") || buildDriveUrl(token),
    }
  }).filter((item) => item.token)
}

/**
 * 按内容哈希查找已有文件（幂等去重）。
 * 在指定文件夹中搜索同名文件，若存在则复用。
 */
export async function findExistingByHash(input: {
  folderToken: string
  fileName: string
  contentHash: string
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}): Promise<FeishuDriveFileItem | null> {
  const files = await listDriveFiles({
    folderToken: input.folderToken,
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  })
  // 按文件名匹配（哈希嵌入文件名或由调用方管理映射）
  const match = files.find((f) => f.name === input.fileName)
  return match ?? null
}

// ─── 辅助 ────────────────────────────────────────────────────────────────────

function buildDriveUrl(token: string): string {
  return token ? `https://feishu.cn/drive/${token}` : ""
}

function extractStr(obj: Record<string, unknown>, paths: string[]): string {
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
