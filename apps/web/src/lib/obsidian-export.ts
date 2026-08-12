import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { env } from "@/env"

export const OBSIDIAN_LIMITS = {
  BODY_MAX_BYTES: 300 * 1024,
  CONTENT_MAX_BYTES: 256 * 1024,
  TITLE_MAX_CHARS: 200,
  DAILY_MAX: 20,
  VAULT_MAX_BYTES: 500 * 1024 * 1024,
  VAULT_MAX_FILES: 5000,
} as const

type DailyBucket = { day: string; count: number }

const dailyExports = new Map<string, DailyBucket>()

/**
 * @description 是否允许当前登录用户导出到 Obsidian（默认关闭）
 */
export function isObsidianExportEnabledForUser(userId: string): boolean {
  return (
    env.OBSIDIAN_EXPORT_ENABLED === "true"
    && typeof env.OBSIDIAN_SYNC_USER_ID === "string"
    && env.OBSIDIAN_SYNC_USER_ID.length > 0
    && userId === env.OBSIDIAN_SYNC_USER_ID
  )
}

/**
 * @description 规范化导出子目录名，拒绝绝对路径与路径逃逸
 */
export function sanitizeExportDir(exportDir: string | undefined): string | null {
  const raw = (exportDir ?? "MingyuanGenerated").trim() || "MingyuanGenerated"
  if (path.isAbsolute(raw)) return null
  const normalized = path.normalize(raw)
  if (
    normalized === ".."
    || normalized.startsWith(`..${path.sep}`)
    || normalized.includes(`${path.sep}..`)
  ) {
    return null
  }
  return normalized
}

/**
 * @description 确认目标路径仍落在固定导出根目录内
 */
export function assertPathInsideRoot(
  exportRoot: string,
  candidatePath: string,
): { ok: true; resolved: string } | { ok: false } {
  const root = path.resolve(exportRoot)
  const resolved = path.resolve(candidatePath)
  const relative = path.relative(root, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false }
  }
  return { ok: true, resolved }
}

/**
 * @description 生成安全文件名（去掉路径分隔与非法字符）
 */
export function buildSafeExportFileName(title: string, counter = 0): string {
  const safeTitle = title
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .slice(0, OBSIDIAN_LIMITS.TITLE_MAX_CHARS)
  const datePrefix = new Date().toISOString().split("T")[0]
  if (counter <= 0) return `${datePrefix}-${safeTitle}.md`
  return `${datePrefix}-${safeTitle}-${counter}.md`
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * @description 检查并占用每日导出名额
 */
export function consumeDailyExportQuota(userId: string): boolean {
  const day = todayKey()
  const current = dailyExports.get(userId)
  if (!current || current.day !== day) {
    dailyExports.set(userId, { day, count: 1 })
    return true
  }
  if (current.count >= OBSIDIAN_LIMITS.DAILY_MAX) return false
  current.count += 1
  return true
}

/**
 * @description 测试用：重置每日配额
 */
export function resetObsidianDailyQuotaForTests(): void {
  dailyExports.clear()
}

/**
 * @description 统计导出目录累计体积与文件数
 */
export async function measureExportDirUsage(
  exportRoot: string,
): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      files += 1
      try {
        const info = await stat(full)
        bytes += info.size
      } catch {
        // ignore race
      }
    }
  }

  await walk(path.resolve(exportRoot))
  return { bytes, files }
}

export type ObsidianConfig = {
  obsidianVaultPath?: string
  exportDir?: string
}

/**
 * @description 读取 Obsidian 同步配置（异步，错误不带绝对路径）
 */
export async function loadObsidianSyncConfig(): Promise<ObsidianConfig | null> {
  const candidates = [
    path.join(process.cwd(), ".obsidian-sync.json"),
    path.join(process.cwd(), "../../", ".obsidian-sync.json"),
    path.join(process.cwd(), "apps/web", ".obsidian-sync.json"),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      const raw = await readFile(candidate, "utf-8")
      return JSON.parse(raw) as ObsidianConfig
    } catch {
      // try next
    }
  }
  return null
}

/**
 * @description 解析固定导出根目录；失败时不暴露服务器路径
 */
export async function resolveFixedExportRoot(
  config: ObsidianConfig,
): Promise<{ ok: true; exportRoot: string; exportDirName: string } | { ok: false; code: string }> {
  const vaultPath = config.obsidianVaultPath?.trim()
  if (!vaultPath) return { ok: false, code: "VAULT_NOT_CONFIGURED" }
  if (!path.isAbsolute(vaultPath)) return { ok: false, code: "VAULT_INVALID" }

  const exportDir = sanitizeExportDir(config.exportDir)
  if (!exportDir) return { ok: false, code: "EXPORT_DIR_INVALID" }

  const exportRoot = path.resolve(vaultPath, exportDir)
  const insideVault = assertPathInsideRoot(vaultPath, exportRoot)
  if (!insideVault.ok) return { ok: false, code: "EXPORT_DIR_ESCAPE" }

  try {
    await access(vaultPath)
  } catch {
    return { ok: false, code: "VAULT_MISSING" }
  }

  return {
    ok: true,
    exportRoot: insideVault.resolved,
    exportDirName: exportDir,
  }
}

/**
 * @description 在导出根下写入 Markdown，写入前再次校验路径
 */
export async function writeObsidianExportFile(input: {
  exportRoot: string
  exportDirName: string
  title: string
  content: string
  format: string
}): Promise<{ ok: true; fileName: string; relativeFilePath: string } | { ok: false; code: string }> {
  try {
    await mkdir(input.exportRoot, { recursive: true })
  } catch {
    return { ok: false, code: "MKDIR_FAILED" }
  }

  let counter = 0
  let fileName = buildSafeExportFileName(input.title, counter)
  let target = path.join(input.exportRoot, fileName)

  while (true) {
    const guarded = assertPathInsideRoot(input.exportRoot, target)
    if (!guarded.ok) return { ok: false, code: "PATH_ESCAPE" }
    try {
      await access(guarded.resolved)
      counter += 1
      fileName = buildSafeExportFileName(input.title, counter)
      target = path.join(input.exportRoot, fileName)
    } catch {
      break
    }
  }

  const guarded = assertPathInsideRoot(input.exportRoot, target)
  if (!guarded.ok) return { ok: false, code: "PATH_ESCAPE" }

  const fileContent = `---
title: ${JSON.stringify(input.title)}
category: "generated_content"
format: ${JSON.stringify(input.format)}
generatedAt: "${new Date().toISOString()}"
tags:
  - Aim/文案
  - 明远AIM
---

# ${input.title}

${input.content}
`

  try {
    await writeFile(guarded.resolved, fileContent, "utf-8")
  } catch {
    return { ok: false, code: "WRITE_FAILED" }
  }

  return {
    ok: true,
    fileName,
    relativeFilePath: `${input.exportDirName}/${fileName}`,
  }
}
