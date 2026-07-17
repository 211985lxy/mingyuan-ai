/**
 * AIM chat request parsing and message normalization.
 *
 * Extracted from chat-context.ts (WP-3).
 */
import type { AimEditorContext } from "@/lib/aim-editor"
import type { AimMemoryMessage } from "@/lib/aim-memory"

/** Extract plain text from an OpenAI-compatible content field. */
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
}

/** Validate and coerce the raw body into strongly-typed fields. */
export function parseAimChatBody(body: unknown): AimChatRequestBody {
  const record = (body ?? {}) as Record<string, unknown>
  return {
    messages: record.messages as unknown[],
    agentId: typeof record.agentId === "string" ? record.agentId : "",
    projectId: typeof record.projectId === "string" ? (record.projectId as string).trim() : "",
    toolAction: typeof record.toolAction === "string" ? record.toolAction : "",
    resultId: typeof record.resultId === "string" ? (record.resultId as string).trim() : "",
    shouldStream: record.stream === true,
    editorContext: typeof record.editorContext === "object" && record.editorContext
      ? (record.editorContext as AimEditorContext)
      : undefined,
  }
}
