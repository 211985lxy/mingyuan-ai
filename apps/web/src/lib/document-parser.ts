import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { forkDocumentParseWorker } from "./document-parser-child"
import { DocumentParseError } from "./document-parser-errors"

export { DocumentParseError } from "./document-parser-errors"

const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".pdf",
  ".docx",
  ".xls",
  ".xlsx",
  ".pptx",
  ".html",
  ".htm",
  ".json",
  ".xml",
  ".rtf",
])

/** 必须走受限子进程的格式（禁止无界进程内回退） */
const RESTRICTED_EXTENSIONS = new Set([".pdf", ".docx", ".xls", ".xlsx", ".pptx"])

const MARKITDOWN_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".xls",
  ".xlsx",
  ".pptx",
  ".html",
  ".htm",
  ".json",
  ".xml",
  ".rtf",
])
const OFFICECLI_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx"])
const execFileAsync = promisify(execFile)

const CHUNK_THRESHOLD = 5000
const CHUNK_MIN_SIZE = 500
const PARSE_TIMEOUT_MS = Number(process.env.DOCUMENT_PARSE_TIMEOUT_MS || 60_000) || 60_000
const MAX_PARSE_CONCURRENCY = 2
const MAX_TEXT_BYTES = 1024 * 1024

function officeCliBin(): string {
  const configured = process.env.OFFICECLI_BIN?.trim()
  return configured || "officecli"
}

/**
 * @description 判断是否supportedfile
 */
export function isSupportedFile(fileName: string): boolean {
  const ext = getExtension(fileName)
  return SUPPORTED_EXTENSIONS.has(ext)
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex === -1) return ""
  return fileName.slice(dotIndex).toLowerCase()
}

function assertTextLimit(text: string): void {
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    throw new DocumentParseError("提取文本超过 1MiB 上限", {
      code: "PARSE_TEXT_TOO_LARGE",
      status: 422,
    })
  }
}

// ─── 并发池（进程级，最多 2 个受限解析） ─────────────────

let activeParses = 0
const parseWaitQueue: Array<() => void> = []

async function withParseSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeParses >= MAX_PARSE_CONCURRENCY) {
    await new Promise<void>((resolve) => parseWaitQueue.push(resolve))
  }
  activeParses += 1
  try {
    return await fn()
  } finally {
    activeParses -= 1
    const next = parseWaitQueue.shift()
    if (next) next()
  }
}

function workerScriptPath(): string {
  // 生产 standalone：构建期把 worker 打包为零依赖 .mjs（服务器无 tsx），server.js 以 apps/web 为工作目录
  const here = path.dirname(fileURLToPath(import.meta.url))
  const compiledCandidates = [
    path.join(process.cwd(), "document-parser-worker.mjs"),
    path.join(here, "document-parser-worker.mjs"),
  ]
  for (const candidate of compiledCandidates) {
    if (existsSync(candidate)) return candidate
  }
  // 开发/测试环境：tsx 直跑 ts 源码
  return path.join(here, "document-parser-worker.ts")
}

async function runRestrictedWorker(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  return withParseSlot(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aim-parse-"))
    const input = path.join(dir, `input${getExtension(fileName)}`)
    try {
      await writeFile(input, buffer)
      const workerScript = workerScriptPath()
      const text = await forkDocumentParseWorker({
        workerScript,
        filePath: input,
        fileName,
        timeoutMs: PARSE_TIMEOUT_MS,
        execArgv: workerScript.endsWith(".mjs")
          ? []
          : process.execArgv.includes("--import")
            ? process.execArgv
            : ["--import", "tsx"],
      })
      assertTextLimit(text)
      return text
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
}

/**
 * 解析文档，返回文本块数组。
 * PDF/DOCX/XLSX/PPTX 仅在受限子进程中解析；失败/超时不回退到无界进程内解析。
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
): Promise<string[]> {
  const ext = getExtension(fileName)

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new DocumentParseError(
      `不支持的文件格式: ${ext}。支持: ${[...SUPPORTED_EXTENSIONS].join(", ")}`,
      { status: 400, code: "PARSE_UNSUPPORTED" },
    )
  }

  let fullText: string

  if (RESTRICTED_EXTENSIONS.has(ext)) {
    fullText = await parseRestrictedDocument(buffer, fileName, ext)
  } else {
    switch (ext) {
      case ".txt":
      case ".md":
      case ".markdown":
        fullText = buffer.toString("utf-8")
        break
      case ".csv":
        fullText = buffer.toString("utf-8")
        break
      case ".html":
      case ".htm":
      case ".json":
      case ".xml":
      case ".rtf":
        fullText = await parseWithMarkitdownStrict(buffer, ext)
        break
      default:
        throw new DocumentParseError(`不支持的文件格式: ${ext}`, {
          status: 400,
          code: "PARSE_UNSUPPORTED",
        })
    }
  }

  fullText = fullText.trim()
  if (!fullText) {
    throw new DocumentParseError("文档内容为空，未提取到任何文本", {
      code: "PARSE_EMPTY",
    })
  }
  assertTextLimit(fullText)
  return chunkText(fullText)
}

async function parseRestrictedDocument(
  buffer: Buffer,
  fileName: string,
  ext: string,
): Promise<string> {
  // 优先 OfficeCLI / MarkItDown（同样有 timeout + maxBuffer），失败再走受限 worker
  // 注意：禁止再调用进程内 mammoth/pdf-parse/xlsx 无界回退
  if (OFFICECLI_EXTENSIONS.has(ext)) {
    const viaOfficeCli = await parseWithOfficeCli(buffer, ext)
    if (viaOfficeCli?.trim()) {
      assertTextLimit(viaOfficeCli)
      return viaOfficeCli
    }
  }

  if (MARKITDOWN_EXTENSIONS.has(ext)) {
    try {
      const viaMd = await parseWithMarkitdownStrict(buffer, ext)
      if (viaMd.trim()) {
        assertTextLimit(viaMd)
        return viaMd
      }
    } catch (error) {
      // pptx 主要依赖 markitdown；其它格式继续走 worker
      if (ext === ".pptx") {
        if (error instanceof DocumentParseError) throw error
        throw new DocumentParseError(
          error instanceof Error ? error.message : "MarkItDown 转换失败",
          { code: "PARSE_CHILD_FAILED" },
        )
      }
    }
  }

  return runRestrictedWorker(buffer, fileName)
}

async function parseWithOfficeCli(buffer: Buffer, ext: string): Promise<string | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "aim-officecli-"))
  const input = path.join(dir, `input${ext}`)
  try {
    await writeFile(input, buffer)
    const { stdout } = await execFileAsync(officeCliBin(), ["view", input, "text"], {
      timeout: PARSE_TIMEOUT_MS,
      maxBuffer: MAX_TEXT_BYTES,
    })
    const text = String(stdout ?? "").trim()
    return text || null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** MarkItDown：失败直接抛错，不回退到进程内无界解析 */
async function parseWithMarkitdownStrict(buffer: Buffer, ext: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aim-markitdown-"))
  const input = path.join(dir, `input${ext}`)
  try {
    await writeFile(input, buffer)
    const { stdout } = await execFileAsync("markitdown", [input], {
      timeout: PARSE_TIMEOUT_MS,
      maxBuffer: MAX_TEXT_BYTES,
    })
    return String(stdout)
  } catch (error) {
    throw new DocumentParseError(
      error instanceof Error ? `MarkItDown 转换失败: ${error.message}` : "MarkItDown 转换失败",
      { code: "PARSE_CHILD_FAILED" },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD) {
    return [text]
  }

  const chunks: string[] = []
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim())
  let current = ""

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (current.length + trimmed.length + 2 > CHUNK_THRESHOLD && current.length >= CHUNK_MIN_SIZE) {
      chunks.push(current.trim())
      current = trimmed
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}
