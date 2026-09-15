import { prisma } from "@/lib/prisma"
import {
  assertSupportedVideoUrl,
  detectVideoPlatform,
  formatVideoTextExtractionError,
} from "@/lib/video-text-extractor"
import { extractVideoTranscript } from "@/lib/content-pipeline/video-processor"
import { createFeishuDoc, fetchFeishuDoc } from "@/lib/integrations/feishu-doc-publisher"
import { buildMediaTranscriptionDocument } from "./document"
import { purifyMediaTranscript } from "./purify"

export type MediaTranscriptionErrorCode =
  | "UNSUPPORTED_LINK"
  | "EXTRACTION_FAILED"
  | "EMPTY_TRANSCRIPT"
  | "PURIFICATION_FAILED"
  | "DOC_CREATE_FAILED"
  | "DOC_VERIFY_FAILED"
  | "PROJECT_UNBOUND"

export class MediaTranscriberError extends Error {
  readonly code: MediaTranscriptionErrorCode

  constructor(code: MediaTranscriptionErrorCode, message: string) {
    super(message)
    this.name = "MediaTranscriberError"
    this.code = code
  }
}

export interface MediaTranscriptionInput {
  externalMessageId: string
  externalChatId: string
  userId: string
  projectId: string
  sourceUrl: string
  executionMode: string
  folderToken?: string
}

export type MediaTranscriptionResult =
  | {
      status: "completed" | "duplicate"
      taskId: string
      title: string
      platform: string
      documentToken: string
      documentUrl: string
    }
  | { status: "processing"; taskId: string }

interface MediaTaskRecord {
  id: string
  status: string
  sourceTitle?: string | null
  platform?: string | null
  documentToken?: string | null
  documentUrl?: string | null
}

export interface MediaTranscriberDeps {
  findTask: (externalMessageId: string) => Promise<MediaTaskRecord | null>
  createTask: (input: MediaTranscriptionInput & { platform: string }) => Promise<{ id: string }>
  updateTask: (id: string, data: Record<string, unknown>) => Promise<unknown>
  extract: typeof extractVideoTranscript
  purify: typeof purifyMediaTranscript
  createDoc: typeof createFeishuDoc
  fetchDoc: typeof fetchFeishuDoc
}

const defaultDeps: MediaTranscriberDeps = {
  findTask: async (externalMessageId) => prisma.mediaTranscriptionTask.findUnique({
    where: { externalMessageId },
    select: {
      id: true,
      status: true,
      sourceTitle: true,
      platform: true,
      documentToken: true,
      documentUrl: true,
    },
  }),
  createTask: async (input) => prisma.mediaTranscriptionTask.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      externalMessageId: input.externalMessageId,
      externalChatId: input.externalChatId,
      sourceUrl: input.sourceUrl,
      platform: input.platform,
      executionModeSnapshot: input.executionMode,
    },
    select: { id: true },
  }),
  updateTask: async (id, data) => prisma.mediaTranscriptionTask.update({ where: { id }, data }),
  extract: extractVideoTranscript,
  purify: purifyMediaTranscript,
  createDoc: createFeishuDoc,
  fetchDoc: fetchFeishuDoc,
}

function existingResult(task: MediaTaskRecord): MediaTranscriptionResult | null {
  if (task.status === "processing") return { status: "processing", taskId: task.id }
  if (task.status === "completed" && task.documentToken && task.documentUrl) {
    return {
      status: "duplicate",
      taskId: task.id,
      title: task.sourceTitle || "未命名音视频",
      platform: task.platform || "unknown",
      documentToken: task.documentToken,
      documentUrl: task.documentUrl,
    }
  }
  if (task.status === "failed") throw new MediaTranscriberError("EXTRACTION_FAILED", "这条消息之前处理失败，请换一个链接后重新发送。")
  return null
}

function normalizeError(error: unknown): MediaTranscriberError {
  if (error instanceof MediaTranscriberError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (message === "EMPTY_TRANSCRIPT") return new MediaTranscriberError("EMPTY_TRANSCRIPT", "没有识别到有效文字。")
  if (message === "PURIFICATION_FAILED") return new MediaTranscriberError("PURIFICATION_FAILED", "转录完成，但整理失败，请稍后重试。")
  return new MediaTranscriberError("EXTRACTION_FAILED", formatVideoTextExtractionError(error))
}

async function claimTask(input: MediaTranscriptionInput, platform: string, deps: MediaTranscriberDeps): Promise<{ task: { id: string }; existing: MediaTranscriptionResult | null }> {
  const known = await deps.findTask(input.externalMessageId)
  if (known) {
    const result = existingResult(known)
    if (result) return { task: { id: known.id }, existing: result }
  }

  try {
    return { task: await deps.createTask({ ...input, platform }), existing: null }
  } catch (error) {
    const raced = await deps.findTask(input.externalMessageId)
    if (raced) {
      const result = existingResult(raced)
      if (result) return { task: { id: raced.id }, existing: result }
    }
    throw error
  }
}

async function extractAndPurify(
  sourceUrl: string,
  platform: string,
  deps: MediaTranscriberDeps,
): Promise<{ title: string; markdown: string }> {
  const extraction = await deps.extract(sourceUrl, platform)
  if (!extraction.transcript?.trim()) throw new MediaTranscriberError("EMPTY_TRANSCRIPT", "没有识别到有效文字。")
  try {
    const purified = await deps.purify({ title: extraction.title, transcript: extraction.transcript })
    return { title: extraction.title || "未命名音视频", markdown: purified.markdown }
  } catch (error) {
    throw error instanceof MediaTranscriberError
      ? error
      : new MediaTranscriberError("PURIFICATION_FAILED", "转录完成，但整理失败，请稍后重试。")
  }
}

async function createVerifiedDocument(
  input: MediaTranscriptionInput,
  title: string,
  platform: string,
  markdown: string,
  deps: MediaTranscriberDeps,
): Promise<{ token: string; url: string }> {
  const document = buildMediaTranscriptionDocument({ title, platform, sourceUrl: input.sourceUrl, purifiedMarkdown: markdown })
  let created: Awaited<ReturnType<typeof createFeishuDoc>>
  try {
    created = await deps.createDoc({ title: document.title, content: document.content, folderToken: input.folderToken })
  } catch {
    throw new MediaTranscriberError("DOC_CREATE_FAILED", "飞书文档创建失败，请稍后重试。")
  }

  try {
    const verified = await deps.fetchDoc({ documentId: created.token })
    if (!verified.title.trim() || !verified.content.trim()) throw new Error("empty document")
  } catch {
    throw new MediaTranscriberError("DOC_VERIFY_FAILED", "飞书文档已创建，但回读校验失败。")
  }
  return { token: created.token, url: created.url }
}

async function processClaimedTask(
  input: MediaTranscriptionInput,
  sourceUrl: string,
  platform: string,
  task: { id: string },
  deps: MediaTranscriberDeps,
): Promise<MediaTranscriptionResult> {
  try {
    const purified = await extractAndPurify(sourceUrl, platform, deps)
    const document = await createVerifiedDocument(input, purified.title, platform, purified.markdown, deps)
    await deps.updateTask(task.id, {
      status: "completed",
      sourceTitle: purified.title,
      documentToken: document.token,
      documentUrl: document.url,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    })
    return { status: "completed", taskId: task.id, title: purified.title, platform, documentToken: document.token, documentUrl: document.url }
  } catch (error) {
    const normalized = normalizeError(error)
    await deps.updateTask(task.id, { status: "failed", errorCode: normalized.code, errorMessage: normalized.message })
    throw normalized
  }
}

export async function runMediaTranscriptionTask(
  input: MediaTranscriptionInput,
  deps: Partial<MediaTranscriberDeps> = {},
): Promise<MediaTranscriptionResult> {
  const resolved = { ...defaultDeps, ...deps }
  let sourceUrl: string
  try {
    sourceUrl = assertSupportedVideoUrl(input.sourceUrl)
  } catch {
    throw new MediaTranscriberError("UNSUPPORTED_LINK", "这个视频链接暂时无法处理，请换一个公开视频链接。")
  }

  const platform = detectVideoPlatform(sourceUrl)
  if (platform === "unknown") throw new MediaTranscriberError("UNSUPPORTED_LINK", "暂不支持这个视频平台。")

  const { task, existing } = await claimTask(input, platform, resolved)
  if (existing) return existing
  return processClaimedTask(input, sourceUrl, platform, task, resolved)
}
