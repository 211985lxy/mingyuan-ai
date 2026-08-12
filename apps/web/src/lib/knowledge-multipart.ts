/**
 * 知识库 multipart 接收：尽早限流、落盘到受控临时目录、校验扩展名/MIME/魔数。
 *
 * Next.js 多数场景仍会走 request.formData()；调用方应先用 Content-Length
 * 做前置拒绝，再调用本模块；写入后务必在 finally 中 cleanupTempDir。
 */

import { createWriteStream } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { env } from "@/env"

export const KNOWLEDGE_MULTIPART_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxRequestBytes: 20 * 1024 * 1024,
  maxFiles: 10,
} as const

const ALLOWED_EXTENSIONS = new Set([
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

const EXT_MIME: Record<string, string[]> = {
  ".txt": ["text/plain"],
  ".md": ["text/plain", "text/markdown"],
  ".markdown": ["text/plain", "text/markdown"],
  ".csv": ["text/csv", "text/plain"],
  ".pdf": ["application/pdf"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  ".xls": ["application/vnd.ms-excel", "application/octet-stream"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
  ],
  ".html": ["text/html"],
  ".htm": ["text/html"],
  ".json": ["application/json", "text/plain"],
  ".xml": ["application/xml", "text/xml", "text/plain"],
  ".rtf": ["application/rtf", "text/rtf", "text/plain"],
}

export class KnowledgeMultipartError extends Error {
  status: number
  code: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.name = "KnowledgeMultipartError"
    this.status = options?.status ?? 400
    this.code = options?.code ?? "KNOWLEDGE_MULTIPART_ERROR"
  }
}

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  if (dot < 0) return ""
  return fileName.slice(dot).toLowerCase()
}

function tempRootDir(override?: string): string {
  return (
    override ||
    env.KNOWLEDGE_UPLOAD_TEMP_DIR ||
    path.join(tmpdir(), "aim-knowledge-uploads")
  )
}

export function assertKnowledgeUploadLimits(input: {
  fileCount: number
  contentLength: number | null
  files: Array<{ name: string; size: number }>
}): void {
  if (input.fileCount > KNOWLEDGE_MULTIPART_LIMITS.maxFiles) {
    throw new KnowledgeMultipartError(
      `文件过多：最多 ${KNOWLEDGE_MULTIPART_LIMITS.maxFiles} 个`,
      { status: 413, code: "KNOWLEDGE_TOO_MANY_FILES" },
    )
  }
  if (
    input.contentLength != null &&
    input.contentLength > KNOWLEDGE_MULTIPART_LIMITS.maxRequestBytes
  ) {
    throw new KnowledgeMultipartError(
      `请求总大小超过 ${KNOWLEDGE_MULTIPART_LIMITS.maxRequestBytes / (1024 * 1024)}MiB`,
      { status: 413, code: "KNOWLEDGE_REQUEST_TOO_LARGE" },
    )
  }
  for (const file of input.files) {
    if (file.size > KNOWLEDGE_MULTIPART_LIMITS.maxFileBytes) {
      throw new KnowledgeMultipartError(
        `单文件超过 ${KNOWLEDGE_MULTIPART_LIMITS.maxFileBytes / (1024 * 1024)}MiB：${file.name}`,
        { status: 413, code: "KNOWLEDGE_FILE_TOO_LARGE" },
      )
    }
  }
  const sum = input.files.reduce((acc, f) => acc + f.size, 0)
  if (sum > KNOWLEDGE_MULTIPART_LIMITS.maxRequestBytes) {
    throw new KnowledgeMultipartError(
      `请求总大小超过 ${KNOWLEDGE_MULTIPART_LIMITS.maxRequestBytes / (1024 * 1024)}MiB`,
      { status: 413, code: "KNOWLEDGE_REQUEST_TOO_LARGE" },
    )
  }
}

/**
 * 返回人类可读的不匹配原因；匹配则返回 null。
 */
export function detectMagicMismatch(
  fileName: string,
  mimeType: string,
  head: Buffer,
): string | null {
  const ext = getExtension(fileName)
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `不支持的扩展名: ${ext || "(无)"}`
  }
  const allowedMimes = EXT_MIME[ext] || []
  const normalized = (mimeType || "").split(";")[0]?.trim().toLowerCase() || ""
  if (
    normalized &&
    normalized !== "application/octet-stream" &&
    !allowedMimes.includes(normalized)
  ) {
    return `MIME 与扩展名不符: ${normalized} vs ${ext}`
  }

  if (ext === ".pdf") {
    if (!head.subarray(0, 5).toString("utf8").startsWith("%PDF-")) {
      return "魔数与扩展名不符：期望 PDF"
    }
  } else if (ext === ".docx" || ext === ".xlsx" || ext === ".pptx") {
    // ZIP local header
    if (!(head[0] === 0x50 && head[1] === 0x4b)) {
      return "魔数与扩展名不符：期望 ZIP/Office"
    }
  } else if (ext === ".png") {
    if (!(head[0] === 0x89 && head[1] === 0x50)) {
      return "魔数与扩展名不符：期望 PNG"
    }
  }

  // PDF magic but declared as text
  if (
    (ext === ".txt" || ext === ".md" || ext === ".csv") &&
    head.subarray(0, 5).toString("utf8").startsWith("%PDF-")
  ) {
    return "魔数与扩展名不符：文本文件却是 PDF"
  }

  return null
}

export type KnowledgeTempFile = {
  fieldName: string
  originalName: string
  mimeType: string
  size: number
  tempPath: string
}

export type KnowledgeMultipartResult = {
  tempDir: string
  files: KnowledgeTempFile[]
  fields: Record<string, string>
}

export async function cleanupTempDir(tempDir: string | null | undefined): Promise<void> {
  if (!tempDir) return
  await rm(tempDir, { recursive: true, force: true })
}

/**
 * 从已解析的 FormData 落盘（调用前应已做 Content-Length 前置检查）。
 */
export async function writeKnowledgeUploadsFromFormData(
  formData: FormData,
  options?: { tempRoot?: string; fieldNames?: string[] },
): Promise<KnowledgeMultipartResult> {
  const fieldNames = new Set(options?.fieldNames ?? ["file", "files"])
  const root = await mkdtemp(path.join(tempRootDir(options?.tempRoot), "km-"))
  const files: KnowledgeTempFile[] = []
  const fields: Record<string, string> = {}

  try {
    const fileEntries: Array<{ fieldName: string; file: File }> = []
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        fields[key] = value
        continue
      }
      if (fieldNames.has(key) || key === "file" || key.startsWith("file")) {
        fileEntries.push({ fieldName: key, file: value as File })
      }
    }

    assertKnowledgeUploadLimits({
      fileCount: fileEntries.length,
      contentLength: null,
      files: fileEntries.map((e) => ({ name: e.file.name, size: e.file.size })),
    })

    for (const [index, entry] of fileEntries.entries()) {
      const { file, fieldName } = entry
      const ext = getExtension(file.name)
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new KnowledgeMultipartError(`不支持的文件格式: ${file.name}`, {
          code: "KNOWLEDGE_UNSUPPORTED_TYPE",
        })
      }

      const arrayBuf = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuf)
      if (buffer.byteLength > KNOWLEDGE_MULTIPART_LIMITS.maxFileBytes) {
        throw new KnowledgeMultipartError(`单文件超过 10MiB：${file.name}`, {
          status: 413,
          code: "KNOWLEDGE_FILE_TOO_LARGE",
        })
      }

      const mismatch = detectMagicMismatch(
        file.name,
        file.type || "application/octet-stream",
        buffer.subarray(0, 16),
      )
      if (mismatch) {
        throw new KnowledgeMultipartError(mismatch, {
          code: "KNOWLEDGE_MAGIC_MISMATCH",
        })
      }

      const safeName = `f${index}${ext}`
      const tempPath = path.join(root, safeName)
      await writeFile(tempPath, buffer)
      files.push({
        fieldName,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: buffer.byteLength,
        tempPath,
      })
    }

    return { tempDir: root, files, fields }
  } catch (error) {
    await cleanupTempDir(root)
    throw error
  }
}

/**
 * 优先用 Content-Length 拒绝超大请求；再解析 formData 落盘。
 */
export async function receiveKnowledgeMultipart(
  request: Request,
  options?: { tempRoot?: string },
): Promise<KnowledgeMultipartResult> {
  const contentLengthHeader = request.headers.get("content-length")
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
  if (
    contentLength != null &&
    Number.isFinite(contentLength) &&
    contentLength > KNOWLEDGE_MULTIPART_LIMITS.maxRequestBytes
  ) {
    throw new KnowledgeMultipartError(
      `请求总大小超过 ${KNOWLEDGE_MULTIPART_LIMITS.maxRequestBytes / (1024 * 1024)}MiB`,
      { status: 413, code: "KNOWLEDGE_REQUEST_TOO_LARGE" },
    )
  }

  // Next/Web API 通常只能 formData；已用 Content-Length 前置限流
  const formData = await request.formData()
  return writeKnowledgeUploadsFromFormData(formData, options)
}

/** 将 Node Readable 限速写入文件（供流式解析复用） */
export async function writeStreamWithLimit(
  stream: Readable,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  let written = 0
  const transform = new Readable({
    read() {},
  })
  stream.on("data", (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    written += buf.byteLength
    if (written > maxBytes) {
      stream.destroy(
        new KnowledgeMultipartError("单文件超过上限", {
          status: 413,
          code: "KNOWLEDGE_FILE_TOO_LARGE",
        }),
      )
      return
    }
    transform.push(buf)
  })
  stream.on("end", () => transform.push(null))
  stream.on("error", (err) => transform.destroy(err))
  await pipeline(transform, createWriteStream(destPath))
  return written
}
