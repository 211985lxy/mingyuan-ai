/**
 * Individual context loaders for AIM chat.
 *
 * Each loader retrieves one context block (knowledge, style, competitor,
 * editor, memory) independently with its own trace step and fallback.
 * Extracted from chat-context.ts (WP-3).
 */
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import {
  enrichKnowledgeQueryWithPainIntent,
  mergePainIntentIntoKnowledgeContext,
  resolvePainPointIntent,
} from "@/lib/aim-pain-intent"
import { buildAimCompetitorWatchContext } from "@/lib/aim-competitor-watch-context"
import {
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
} from "@/lib/aim-knowledge-strategy"
import { getStyleProfileBlock } from "@/lib/style-profile"
import { formatEditorContextForPrompt, type AimEditorContext } from "@/lib/aim-editor"
import {
  runAimTraceStep,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import {
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
} from "@/lib/aim-memory"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import type { AimConversationIntent } from "@/lib/aim-conversation-intent"
import { composeAimReferenceContext } from "@/lib/aim-context-priority"
import {
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
  type MethodologyPolicy,
} from "@/lib/methodology-profile-store"

export type RetrievedChatContextBlocks = {
  knowledgeBlock: string
  knowledgeContext: { entries: Array<{ id: string; content: string }>; source: string }
  styleBlock: string
  competitorWatchBlock: string
  editorBlock: string
  memoryBlock: string
  /** ADR-002：本次指定命名方法论（独立块，未选择时为空串）。 */
  selectedMethodologyBlock: string
  /** ADR-002：解析后的方法论策略（供 manifest 记录）。 */
  methodologyPolicy: MethodologyPolicy
}

/**
 * Retrieve all context blocks for a chat turn.
 *
 * Order, gates, and catch fallbacks are preserved byte-for-byte from the
 * original route implementation.
 */
/**
 * @description retrievechatcontextblocks
 * @param input - 输入数据
 * @returns Promise<RetrievedChatContextBlocks>
 */
export async function retrieveChatContextBlocks(input: {
  userId: string
  projectId: string
  agentId: string
  query: string
  editorContext?: AimEditorContext
  conversationIntent: AimConversationIntent
  runtimeTask: AimRuntimeTask
  trace?: AimTraceRecorder
  /** ADR-002：显式选择的命名方法论 profile id。 */
  methodologyProfileIds?: string[]
}): Promise<RetrievedChatContextBlocks> {
  const { userId, projectId, agentId, query, editorContext, conversationIntent, runtimeTask, trace } = input

  const shouldUseKnowledgeContext = conversationIntent.useKnowledge || shouldUseKnowledgeContextForTask(runtimeTask)
  const shouldUseMarketContext =
    conversationIntent.useKnowledge && shouldUseMarketViralContextForTask(runtimeTask)

  const shouldResolvePainIntent = Boolean(
    shouldUseKnowledgeContext
    && projectId
    && projectId !== "<no-project>"
    && (agentId === "content_producer" || agentId === "deep_copywriter" || agentId === "free_copywriter"),
  )

  const painIntent = shouldResolvePainIntent
    ? await runAimTraceStep(
        trace,
        "pain_intent",
        "痛点意图识别",
        () => resolvePainPointIntent({ projectId, userText: query }).catch(() => null),
        (result) => ({
          summary: result?.painIds?.length ? `锚定 ${result.painIds.join("、")}` : "未锚定痛点",
          metadata: {
            painIds: result?.painIds ?? [],
            confidence: result?.confidence ?? 0,
          },
        }),
      )
    : null

  const knowledgeQuery = enrichKnowledgeQueryWithPainIntent(query, painIntent)

  const knowledgeContext = shouldUseKnowledgeContext
    ? await runAimTraceStep(
        trace,
        "knowledge_context",
        "知识库召回",
        () => buildAimKnowledgeContext({
          userId,
          projectId: projectId || "<no-project>",
          agentId,
          query: knowledgeQuery,
        })
          .then((result) => {
            const merged = mergePainIntentIntoKnowledgeContext({
              knowledgeBlock: result.knowledgeBlock,
              entries: result.entries,
              intent: painIntent,
            })
            return { ...result, ...merged }
          })
          .catch(() => ({ knowledgeBlock: "", entries: [], source: "raw" as const })),
        (result) => ({
          summary: `命中 ${result.entries.length} 条知识`,
          metadata: { entries: result.entries.length, source: result.source, painIds: painIntent?.painIds ?? [] },
        }),
      )
    : { knowledgeBlock: "", entries: [], source: "skipped" as const }

  const styleBlock = conversationIntent.useStyleProfile
    ? await runAimTraceStep(
        trace,
        "style_profile",
        "风格档案召回",
        () => getStyleProfileBlock(userId, projectId || null).catch(() => ""),
        (block) => ({ summary: block ? "已召回" : "无风格档案", metadata: { chars: block.length } }),
      )
    : ""

  const competitorWatchBlock =
    agentId === "business_diagnosis" && shouldUseMarketContext
      ? await runAimTraceStep(
          trace,
          "competitor_context",
          "竞品上下文召回",
          () => buildAimCompetitorWatchContext(userId, query).catch(() => ""),
          (block) => ({ summary: block ? "已召回竞品上下文" : "无竞品上下文", metadata: { chars: block.length } }),
        )
      : ""

  const editorBlock = await runAimTraceStep(
    trace,
    "editor_context",
    "编辑器上下文注入",
    () => formatEditorContextForPrompt(editorContext),
    (block) => ({ summary: block ? "已注入选中文案" : "无编辑器上下文", metadata: { chars: block.length } }),
  )

  const memoryRows = conversationIntent.useLongTermMemory
    ? await runAimTraceStep(
        trace,
        "aim_memory",
        "历史记忆召回",
        () => projectId
          ? retrieveAimMemory({ userId, projectId, agentId }).catch(() => [])
          : retrieveLayeredAimMemory({ userId, projectId, agentId }).catch(() => []),
        (rows) => ({ summary: `召回 ${rows.length} 条记忆`, metadata: { count: rows.length } }),
      )
    : []
  const memoryBlock = formatAimMemoryBlock(memoryRows)

  const knowledgeBlock = composeAimReferenceContext({
    currentMaterial: editorBlock,
    projectKnowledge: knowledgeContext.knowledgeBlock,
    memory: memoryBlock,
    style: styleBlock,
    externalReference: competitorWatchBlock,
  })

  // ADR-002：命名方法论（显式 ID > 文本精确命中 > none），与 generate/scripts 共用同一解析函数
  const methodologyPolicy = await resolveMethodologyPolicy({
    userId,
    methodologyProfileIds: input.methodologyProfileIds,
    rawInput: query,
  })
  const selectedMethodologyBlock = buildMethodologyProfileBlock(methodologyPolicy)

  return {
    knowledgeBlock,
    knowledgeContext,
    styleBlock,
    competitorWatchBlock,
    editorBlock,
    memoryBlock,
    selectedMethodologyBlock,
    methodologyPolicy,
  }
}
