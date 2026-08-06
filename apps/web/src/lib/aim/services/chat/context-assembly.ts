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
  /** 数据复盘专用：已格式化发布结果；非复盘或无目标时为 undefined。 */
  publishOutcomeBlock?: string
}

/**
 * 对话模式是最终路由结论；runtimeTask 只负责选择生成预算和知识策略，
 * 不能再把局部修改或版本选择升级成新文案创作。
 */
export function resolveAimChatRuntimeTask(
  inferredTask: AimRuntimeTask,
  conversationMode: AimConversationIntent["mode"],
): AimRuntimeTask {
  if (
    conversationMode === "local_edit"
    || conversationMode === "select_version"
    || conversationMode === "clarify_task_boundary"
  ) {
    return "light_edit"
  }
  if (conversationMode === "follow_up_edit" && inferredTask === "new_copy") {
    return "rewrite_copy"
  }
  return inferredTask
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
async function resolveChatIntentAndTask(input: {
  executionAgentId: string
  messages: unknown[]
  query: string
  trace?: AimTraceRecorder
}) {
  const inferredRuntimeTask = resolveAimRuntimeTask({
    agentId: input.executionAgentId,
    input: input.query,
  })
  const conversationIntent = await runAimTraceStep(
    input.trace,
    "conversation_intent",
    "对话意图识别",
    () => resolveAimConversationIntent({
      agentId: input.executionAgentId,
      messages: input.messages as never,
    }),
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
  return {
    conversationIntent,
    runtimeTask: resolveAimChatRuntimeTask(inferredRuntimeTask, conversationIntent.mode),
  }
}

/**
 * @description 组装aimchatcontext
 * @param input - 输入数据
 * @returns Promise<AssembledAimChatContext>
 */
export async function assembleAimChatContext(input: {
  userId: string
  projectId: string
  agentId: string
  /**
   * 本轮执行引擎（技能跨引擎委托）。缺省等于 agentId。
   * 运行时任务、对话意图、知识策略与知识分类都按它分流，
   * 保证委托执行拿到的是目标引擎自己的配置，而不是会话智能体的。
   */
  executionAgentId?: string
  messages: unknown[]
  editorContext?: AimEditorContext
  trace?: AimTraceRecorder
  /** ADR-002：显式选择的命名方法论 profile id。 */
  methodologyProfileIds?: string[]
  /** 方法论类技能一次性透传：本轮按需注入对应方法论/爆款结构（与 generate 路径对称）。 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
  /**
   * 目标内容 AimGeneration id（请求体 resultId）。
   * 仅 content_retro 执行轮用于发布数据召回。
   */
  targetGenerationId?: string
}): Promise<AssembledAimChatContext> {
  const { userId, projectId, agentId, messages, editorContext, trace } = input
  const executionAgentId = input.executionAgentId ?? agentId
  const lastMessage = messages[messages.length - 1] as { content?: unknown } | undefined
  const query = extractTextContent(lastMessage?.content).slice(0, 500)

  const { conversationIntent, runtimeTask } = await resolveChatIntentAndTask({
    executionAgentId,
    messages,
    query,
    trace,
  })

  // 方法论类技能信号接管 useMethodology（与 generate 路径 prepareAimContext 对称）：
  // 默认不提取方法论/爆款，只有点了对应技能才注入。缺省时回落到文本意图推断值。
  const activeMethodologySignals = input.activeMethodologySignals ?? []
  const resolvedConversationIntent = activeMethodologySignals.length > 0
    ? { ...conversationIntent, useMethodology: true }
    : conversationIntent

  const isolatesCurrentTurn = resolvedConversationIntent.mode === "new_task" || resolvedConversationIntent.mode === "clarify_task_boundary"
  const blocks = await retrieveChatContextBlocks({
    userId,
    projectId,
    agentId: executionAgentId,
    memoryAgentId: agentId,
    query,
    editorContext: isolatesCurrentTurn ? undefined : editorContext,
    conversationIntent: resolvedConversationIntent,
    runtimeTask,
    trace,
    methodologyProfileIds: input.methodologyProfileIds,
    activeMethodologySignals,
    targetGenerationId: input.targetGenerationId,
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
    publishOutcomeBlock: blocks.publishOutcomeBlock,
  }
}
