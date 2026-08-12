/**
 * 受限文档解析 worker：在子进程内解析 PDF/Office，带解压炸弹与文本上限。
 * 由 document-parser 通过 child_process.fork 调用；勿在请求进程内直接跑无界解析。
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import pdfParse from "pdf-parse"
import mammoth from "mammoth"
import * as XLSX from "xlsx"

const MAX_TEXT_BYTES = 1024 * 1024
const MAX_UNCOMPRESSED = 50 * 1024 * 1024
const MAX_ZIP_ENTRIES = 1000
const MAX_ZIP_RATIO = 100
const MAX_XLSX_SHEETS = 50
const MAX_XLSX_CELLS = 200_000
const MAX_PDF_PAGES = 500

export type WorkerRequest = {
  filePath: string
  fileName: string
}

export type WorkerResponse =
  | { ok: true; text: string }
  | { ok: false; error: string; code: string }

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  if (dot < 0) return ""
  return fileName.slice(dot).toLowerCase()
}

function assertTextSize(text: string): void {
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes > MAX_TEXT_BYTES) {
    throw Object.assign(new Error("提取文本超过 1MiB 上限"), {
      code: "PARSE_TEXT_TOO_LARGE",
    })
  }
}

/** 轻量 ZIP 中央目录扫描：条目数、未压缩总大小、压缩比 */
export function assertSafeZipBuffer(buffer: Buffer): void {
  // End of central directory signature
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65_535 - 22; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocd = i
      break
    }
  }
  if (eocd < 0) {
    throw Object.assign(new Error("无效的 Office/ZIP 归档"), {
      code: "PARSE_ZIP_INVALID",
    })
  }

  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)

  if (entryCount > MAX_ZIP_ENTRIES) {
    throw Object.assign(new Error(`ZIP 条目过多（>${MAX_ZIP_ENTRIES}）`), {
      code: "PARSE_ZIP_BOMB",
    })
  }

  let uncompressed = 0
  let compressed = 0
  let offset = centralOffset
  const end = Math.min(buffer.length, centralOffset + centralSize + 4)

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > end && offset + 46 > buffer.length) break
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x01 ||
      buffer[offset + 3] !== 0x02
    ) {
      break
    }
    const comp = buffer.readUInt32LE(offset + 20)
    const uncomp = buffer.readUInt32LE(offset + 24)
    const nameLen = buffer.readUInt16LE(offset + 28)
    const extraLen = buffer.readUInt16LE(offset + 30)
    const commentLen = buffer.readUInt16LE(offset + 32)
    compressed += comp
    uncompressed += uncomp
    offset += 46 + nameLen + extraLen + commentLen
  }

  if (uncompressed > MAX_UNCOMPRESSED) {
    throw Object.assign(new Error("解压后体积超过 50MiB"), {
      code: "PARSE_ZIP_BOMB",
    })
  }
  if (compressed > 0 && uncompressed / compressed > MAX_ZIP_RATIO) {
    throw Object.assign(new Error("压缩比过高，疑似 zip bomb"), {
      code: "PARSE_ZIP_BOMB",
    })
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer)
  if (typeof data.numpages === "number" && data.numpages > MAX_PDF_PAGES) {
    throw Object.assign(new Error(`PDF 页数超过 ${MAX_PDF_PAGES}`), {
      code: "PARSE_PDF_TOO_MANY_PAGES",
    })
  }
  return data.text || ""
}

async function parseDocx(buffer: Buffer): Promise<string> {
  assertSafeZipBuffer(buffer)
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ""
}

function parseXlsx(buffer: Buffer): string {
  assertSafeZipBuffer(buffer)
  const workbook = XLSX.read(buffer, { type: "buffer", dense: true })
  if (workbook.SheetNames.length > MAX_XLSX_SHEETS) {
    throw Object.assign(new Error(`工作表超过 ${MAX_XLSX_SHEETS} 张`), {
      code: "PARSE_XLSX_TOO_MANY_SHEETS",
    })
  }

  let cells = 0
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const ref = sheet["!ref"]
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      cells += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1)
      if (cells > MAX_XLSX_CELLS) {
        throw Object.assign(new Error(`单元格超过 ${MAX_XLSX_CELLS}`), {
          code: "PARSE_XLSX_TOO_MANY_CELLS",
        })
      }
    }
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

async function parsePptx(buffer: Buffer): Promise<string> {
  assertSafeZipBuffer(buffer)
  // 无内置 pptx 抽取器：仅做炸弹检查后报错，由父进程走 markitdown 子进程（同样受限）
  throw Object.assign(new Error("PPTX 需通过受限外部转换器解析"), {
    code: "PARSE_PPTX_NEEDS_CONVERTER",
  })
}

export async function parseRestrictedBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const ext = getExtension(fileName)
  let text = ""
  switch (ext) {
    case ".pdf":
      text = await parsePdf(buffer)
      break
    case ".docx":
      text = await parseDocx(buffer)
      break
    case ".xls":
    case ".xlsx":
      text = parseXlsx(buffer)
      break
    case ".pptx":
      text = await parsePptx(buffer)
      break
    default:
      throw Object.assign(new Error(`worker 不支持: ${ext}`), {
        code: "PARSE_UNSUPPORTED",
      })
  }
  assertTextSize(text)
  return text
}

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    const buffer = await readFile(req.filePath)
    const text = await parseRestrictedBuffer(buffer, req.fileName || path.basename(req.filePath))
    return { ok: true, text }
  } catch (error) {
    const err = error as Error & { code?: string }
    return {
      ok: false,
      error: err.message || "解析失败",
      code: err.code || "PARSE_CHILD_FAILED",
    }
  }
}

if (typeof process !== "undefined" && process.send) {
  process.on("message", (msg: WorkerRequest) => {
    void handle(msg).then((res) => {
      process.send?.(res)
    })
  })
}
