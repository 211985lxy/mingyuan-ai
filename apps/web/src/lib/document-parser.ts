import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import pdfParse from "pdf-parse"
import mammoth from "mammoth"
import * as XLSX from "xlsx"

/** 支持的文件扩展名 */
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

const MARKITDOWN_EXTENSIONS = new Set([".pdf", ".docx", ".xls", ".xlsx", ".pptx", ".html", ".htm", ".json", ".xml", ".rtf"])
/** OfficeCLI 擅长的 Office 格式（可选增强；未安装则跳过） */
const OFFICECLI_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx"])
const execFileAsync = promisify(execFile)

/** 分块阈值：超过此字数按段落边界拆分 */
const CHUNK_THRESHOLD = 5000

/** 分块最小字数，避免产生过短的碎片 */
const CHUNK_MIN_SIZE = 500

function officeCliBin(): string {
  const configured = process.env.OFFICECLI_BIN?.trim()
  return configured || "officecli"
}

/**
 * @description 判断是否supportedfile
 * @param fileName - 文件名称
 * @returns boolean
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

/**
 * 解析文档，返回文本块数组。
 * 小文档返回单元素数组，大文档按段落边界分块。
 *
 * Office 格式抽正文优先级：OfficeCLI（若可用）→ MarkItDown → 内置回退（mammoth/xlsx/pdf）。
 */
/**
 * @description 解析document
 * @param buffer - 缓冲区
 * @param fileName - 文件名称
 * @returns Promise<string[]>
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string
): Promise<string[]> {
  const ext = getExtension(fileName)

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的文件格式: ${ext}。支持: ${[...SUPPORTED_EXTENSIONS].join(", ")}`)
  }

  let fullText: string

  if (OFFICECLI_EXTENSIONS.has(ext)) {
    const viaOfficeCli = await parseWithOfficeCli(buffer, ext)
    if (viaOfficeCli?.trim()) {
      fullText = viaOfficeCli
    } else if (MARKITDOWN_EXTENSIONS.has(ext)) {
      fullText = await parseWithMarkitdown(buffer, ext)
    } else {
      fullText = await parseOfficeFallback(buffer, ext)
    }
  } else if (MARKITDOWN_EXTENSIONS.has(ext)) {
    fullText = await parseWithMarkitdown(buffer, ext)
  } else switch (ext) {
    case ".txt":
    case ".md":
    case ".markdown":
      fullText = buffer.toString("utf-8")
      break

    case ".csv":
      fullText = parseCsvToText(buffer)
      break

    case ".pdf":
      fullText = await parsePdf(buffer)
      break

    default:
      throw new Error(`不支持的文件格式: ${ext}`)
  }

  fullText = fullText.trim()
  if (!fullText) {
    throw new Error("文档内容为空，未提取到任何文本")
  }

  return chunkText(fullText)
}

// ─── 格式解析器 ─────────────────────────────────────────────

/**
 * @description 用 OfficeCLI `view … text` 抽正文；未安装或失败返回 null（不抛错）
 */
async function parseWithOfficeCli(buffer: Buffer, ext: string): Promise<string | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "aim-officecli-"))
  const input = path.join(dir, `input${ext}`)
  try {
    await writeFile(input, buffer)
    const { stdout } = await execFileAsync(
      officeCliBin(),
      ["view", input, "text"],
      { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 },
    )
    const text = String(stdout ?? "").trim()
    return text || null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function parseOfficeFallback(buffer: Buffer, ext: string): Promise<string> {
  if (ext === ".docx") return parseDocx(buffer)
  if (ext === ".xls" || ext === ".xlsx") return parseXlsx(buffer)
  throw new Error(`无内置回退解析器: ${ext}`)
}

async function parseWithMarkitdown(buffer: Buffer, ext: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aim-markitdown-"))
  const input = path.join(dir, `input${ext}`)
  try {
    await writeFile(input, buffer)
    const { stdout } = await execFileAsync("markitdown", [input], { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 })
    return String(stdout)
  } catch (error) {
    if (ext === ".pdf") return parsePdf(buffer)
    if (ext === ".docx") return parseDocx(buffer)
    if (ext === ".xls" || ext === ".xlsx") return parseXlsx(buffer)
    throw new Error(error instanceof Error ? `MarkItDown 转换失败: ${error.message}` : "MarkItDown 转换失败")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer)
  return data.text
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

function parseXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const lines: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    // 使用 sheet_to_csv 获取纯文本行
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) {
      if (workbook.SheetNames.length > 1) {
        lines.push(`【工作表: ${sheetName}】`)
      }
      lines.push(csv)
    }
  }

  return lines.join("\n\n")
}

function parseCsvToText(buffer: Buffer): string {
  // CSV 直接作为文本返回，按行保留
  return buffer.toString("utf-8")
}

// ─── 文本分块 ───────────────────────────────────────────────

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD) {
    return [text]
  }

  const chunks: string[] = []
  // 按双换行（段落边界）拆分
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
