/**
 * AIM chat request parsing and message normalization.
 *
 * Extracted from chat-context.ts (WP-3).
 */
import type { AimEditorContext } from "@/lib/aim-editor"
import type { AimMemoryMessage } from "@/lib/aim-memory"
import { normalizeRequestedCopyStudioModule, supportsCopyStudioModule } from "@/lib/copy-studio"

/** Extract plain text from an OpenAI-compatible content field. */
/**
 * @description 提取textcontent
 * @param content - 内容
 * @returns string
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const item = part as { type?: unknown; text?: unknown }
      return item.type === "text" && typeof item.text === "string" ? item.text : ""
    })
    .filter(Boolean)
    .join("\n")
}

/** Normalize chat messages to the format needed for memory extraction. */
/**
 * @description 标准化memorymessages
 * @param messages - 消息列表
 * @returns AimMemoryMessage[]
 */
export function normalizeMemoryMessages(messages: unknown[]): AimMemoryMessage[] {
  if (!Array.isArray(messages)) return []
  return messages
    .map((item) => {
      const role = (item as { role?: unknown })?.role
      const content = (item as { content?: unknown })?.content
      if (role !== "user" && role !== "assistant") return null
      const trimmed = extractTextContent(content).trim()
      if (!trimmed) return null
      return { role, content: trimmed } as AimMemoryMessage
    })
    .filter((item): item is AimMemoryMessage => item !== null)
}

/** Parsed fields from the raw POST body of /api/aim/chat. */
export type AimChatRequestBody = {
  messages: unknown[]
  agentId: string
  projectId: string
  toolAction: string
  resultId: string
  shouldStream: boolean
  editorContext?: AimEditorContext
  agentModule?: "social" | "longform" | "free"
  writerModule?: "social" | "longform" | "free"
  traceId?: string
}

/** Result of parsing the chat body: either a validated request or an error response. */
export type ParsedAimChatBody =
  | { ok: false; status: 400; validationError: string }
  | ({ ok: true } & AimChatRequestBody)

/**
 * Validate and coerce the raw body into strongly-typed fields.
 *
 * Returns a discriminated union so the route can branch on `ok`, mirroring the
 * prepare→execute→serialize shape used by the generate entrypoint. The messages
 * validation (previously inline in the route) lives here so the route no longer
 * decides request validity — message text and status code are unchanged.
 */
/**
 * @description 解析aimchatbody
 * @param body - 请求体
 * @returns ParsedAimChatBody
 */
export function parseAimChatBody(body: unknown): ParsedAimChatBody {
  const record = (body ?? {}) as Record<string, unknown>
  const messages = record.messages as unknown[]
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, status: 400, validationError: "请求格式不正确，缺少 messages 数组" }
  }
  const agentModule = normalizeRequestedCopyStudioModule(record.agentModule, record.writerModule)
  const requestedAgent = typeof record.agentId === "string" ? record.agentId : ""
  if (agentModule && !supportsCopyStudioModule(requestedAgent)) {
    return { ok: false, status: 400, validationError: "agentModule 只能用于内容创作官" }
  }
  return {
    ok: true,
    messages,
    agentId: typeof record.agentId === "string" ? record.agentId : "",
    projectId: typeof record.projectId === "string" ? (record.projectId as string).trim() : "",
    toolAction: typeof record.toolAction === "string" ? record.toolAction : "",
    resultId: typeof record.resultId === "string" ? (record.resultId as string).trim() : "",
    shouldStream: record.stream === true,
    editorContext: typeof record.editorContext === "object" && record.editorContext
      ? (record.editorContext as AimEditorContext)
      : undefined,
    agentModule,
    writerModule: agentModule,
    traceId: typeof record.traceId === "string" ? (record.traceId as string).trim() : undefined,
  }
}
