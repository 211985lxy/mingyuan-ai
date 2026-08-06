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
import { resolvePublishOutcomeBlock } from "@/lib/aim/content-outcome-context"

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
  /** 数据复盘专用：已格式化的发布结果块；非复盘或无目标内容时为 undefined。 */
  publishOutcomeBlock?: string
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
  /** 本轮执行引擎：决定知识分类优先级、痛点识别与竞品召回的分流 */
  agentId: string
  /**
   * 会话归属智能体：长期记忆按会话归属读写，跨引擎委托时不能改成执行引擎，
   * 否则同一轮对话会读 A 引擎的记忆、写 B 引擎的记忆。
   */
  memoryAgentId?: string
  query: string
  editorContext?: AimEditorContext
  conversationIntent: AimConversationIntent
  runtimeTask: AimRuntimeTask
  trace?: AimTraceRecorder
  /** ADR-002：显式选择的命名方法论 profile id。 */
  methodologyProfileIds?: string[]
  /** 方法论类技能一次性透传（与 generate 路径对称；当前 chat 不注入方法论 md，预留扩展）。 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
  /**
   * 目标内容的 AimGeneration id（请求体 resultId）。
   * 仅 content_retro 执行轮用来读发布数据；缺省不查库、不猜最近一条。
   */
  targetGenerationId?: string
}): Promise<RetrievedChatContextBlocks> {
  const { userId, projectId, agentId, query, editorContext, conversationIntent, runtimeTask, trace } = input
  const memoryAgentId = input.memoryAgentId ?? agentId

  const shouldUseKnowledgeContext = conversationIntent.useKnowledge || shouldUseKnowledgeContextForTask(runtimeTask)
  const shouldUseMarketContext =
    conversationIntent.useKnowledge && shouldUseMarketViralContextForTask(runtimeTask)

  const shouldResolvePainIntent = Boolean(
    shouldUseKnowledgeContext
    && projectId
    && projectId !== "<no-project>"
    && (agentId === "content_producer" || agentId === "work_editor" || agentId === "free_copywriter"),
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
          ? retrieveAimMemory({ userId, projectId, agentId: memoryAgentId }).catch(() => [])
          : retrieveLayeredAimMemory({ userId, projectId, agentId: memoryAgentId }).catch(() => []),
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

  // 只在数据复盘执行轮才走发布数据路径；其它引擎零开销，装配结果与今天一致。
  const publishOutcomeBlock = agentId === "content_retro"
    ? await runAimTraceStep(
        trace,
        "publish_outcome_context",
        "发布结果数据召回",
        () => resolvePublishOutcomeBlock({
          executionAgentId: agentId,
          userId,
          generationId: input.targetGenerationId,
        }),
        (block) => ({
          summary: block ? "已注入发布数据" : "未注入发布数据",
          metadata: {
            chars: block?.length ?? 0,
            targetGenerationId: input.targetGenerationId ?? null,
          },
        }),
      )
    : undefined

  return {
    knowledgeBlock,
    knowledgeContext,
    styleBlock,
    competitorWatchBlock,
    editorBlock,
    memoryBlock,
    selectedMethodologyBlock,
    methodologyPolicy,
    publishOutcomeBlock,
  }
}
