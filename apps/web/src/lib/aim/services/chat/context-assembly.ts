/**
 * AIM chat context assembly — orchestrates intent resolution and context
 * block retrieval into a single assembled context object.
 *
 * Extracted from chat-context.ts (WP-3).
 */
import { resolveAimConversationIntent, type AimConversationIntent } from "@/lib/aim-conversation-intent"
import {
  resolveAimRuntimeTask,
  type AimRuntimeTask,
} from "@/lib/aim-knowledge-strategy"
import { runAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"
import { sha256 } from "@/lib/aim-harness/hashing"
import type { AimContextSource } from "@/lib/aim-harness/types"
import type { AimEditorContext } from "@/lib/aim-editor"
import type { AimMemoryMessage } from "@/lib/aim-memory"
import { retrieveChatContextBlocks, type RetrievedChatContextBlocks } from "./context-loaders"
import { extractTextContent, normalizeMemoryMessages } from "./request"

export type AssembledAimChatContext = {
  runtimeTask: AimRuntimeTask
  conversationIntent: AimConversationIntent
  knowledgeBlock: string
  contextManifest: AimContextSource[]
  normalizedMessages: AimMemoryMessage[]
  query: string
  knowledgeEntries: number
  knowledgeSource: string
  /** ADR-002：本次指定命名方法论块。 */
  selectedMethodologyBlock: string
  /** ADR-002：解析后的方法论策略（供 chatParams 透传到 handler）。 */
  methodologyPolicy: import("@/lib/methodology-profile-store").MethodologyPolicy
}

/** Build contextManifest from assembled blocks and normalized messages. */
function buildChatContextManifest(input: {
  query: string
  blocks: RetrievedChatContextBlocks
  normalizedMessages: AimMemoryMessage[]
}): AimContextSource[] {
  const { query, blocks, normalizedMessages } = input
  const manifest: AimContextSource[] = [
    {
      kind: "request",
      id: "raw_input",
      charCount: query.length,
      contentHash: sha256(query),
    },
    ...blocks.knowledgeContext.entries.map((entry) => ({
      kind: "knowledge" as const,
      id: entry.id,
      charCount: entry.content.length,
      contentHash: sha256(entry.content),
    })),
  ]
  const contextBlocks: Array<[AimContextSource["kind"], string, string]> = [
    ["memory", "long_term_memory", blocks.memoryBlock],
    ["competitor_watch", "competitor_watch", blocks.competitorWatchBlock],
    ["methodology", "style_profile", blocks.styleBlock],
    ["history", "editor_context", blocks.editorBlock],
    ["history", "conversation_history", JSON.stringify(normalizedMessages)],
  ]
  for (const [kind, id, content] of contextBlocks) {
    if (content) manifest.push({ kind, id, charCount: content.length, contentHash: sha256(content) })
  }
  // ADR-002：命名方法论精确到发布的版本（versionId + checksum），保证可追溯
  for (const row of blocks.methodologyPolicy.versionRows) {
    manifest.push({
      kind: "methodology",
      id: `named_methodology:${row.versionId}`,
      updatedAt: row.updatedAt,
      charCount: blocks.selectedMethodologyBlock.length,
      contentHash: row.checksum,
    })
  }
  return manifest
}

/**
 * Full context assembly for the normal chat path:
 * intent → block retrieval → knowledgeBlock concatenation → manifest.
 *
 * Order, gates, catch fallbacks, and trace steps are preserved byte-for-byte
 * from the original route implementation.
 */
/**
 * @description 组装aimchatcontext
 * @param input - 输入数据
 * @returns Promise<AssembledAimChatContext>
 */
export async function assembleAimChatContext(input: {
  userId: string
  projectId: string
  agentId: string
  messages: unknown[]
  editorContext?: AimEditorContext
  trace?: AimTraceRecorder
  /** ADR-002：显式选择的命名方法论 profile id。 */
  methodologyProfileIds?: string[]
}): Promise<AssembledAimChatContext> {
  const { userId, projectId, agentId, messages, editorContext, trace } = input
  const lastMessage = messages[messages.length - 1] as { content?: unknown } | undefined
  const query = extractTextContent(lastMessage?.content).slice(0, 500)

  const runtimeTask = resolveAimRuntimeTask({ agentId, input: query })

  const conversationIntent = await runAimTraceStep(
    trace,
    "conversation_intent",
    "对话意图识别",
    () => resolveAimConversationIntent({ agentId, messages: messages as never }),
    (intent) => ({
      summary: `${intent.mode} (${intent.reason})`,
      metadata: {
        confidence: intent.confidence,
        useKnowledge: intent.useKnowledge,
        useMethodology: intent.useMethodology,
        useLongTermMemory: intent.useLongTermMemory,
        useStyleProfile: intent.useStyleProfile,
      },
    }),
  )

  const isolatesCurrentTurn = conversationIntent.mode === "new_task" || conversationIntent.mode === "clarify_task_boundary"
  const blocks = await retrieveChatContextBlocks({
    userId,
    projectId,
    agentId,
    query,
    editorContext: isolatesCurrentTurn ? undefined : editorContext,
    conversationIntent,
    runtimeTask,
    trace,
    methodologyProfileIds: input.methodologyProfileIds,
  })

  const allNormalizedMessages = normalizeMemoryMessages(messages)
  const normalizedMessages = isolatesCurrentTurn
    ? allNormalizedMessages.slice(-1)
    : allNormalizedMessages

  const contextManifest = buildChatContextManifest({ query, blocks, normalizedMessages })

  return {
    runtimeTask,
    conversationIntent,
    knowledgeBlock: blocks.knowledgeBlock,
    contextManifest,
    normalizedMessages,
    query,
    knowledgeEntries: blocks.knowledgeContext.entries.length,
    knowledgeSource: blocks.knowledgeContext.source,
    selectedMethodologyBlock: blocks.selectedMethodologyBlock,
    methodologyPolicy: blocks.methodologyPolicy,
  }
}
