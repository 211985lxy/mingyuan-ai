import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { generateTopicCards } from "@/lib/topic-generation"
import type { RecommendationMode } from "@/lib/topic-generation"
import type { TopicCard } from "@/lib/topic-validation"
import {
  evaluateTopicCards,
  selectTopCompetitorEvidence,
  type TopicEditorReviewer,
} from "@/lib/topic-editor-review"
import {
  buildBenchmarkAccountSources,
  buildProjectSource,
  buildTopicSources,
  buildVideoCopyExtractionSources,
  type TopicSource,
} from "@/lib/topic-source-builders"
import {
  deriveRecentElementSets,
  deriveRecentTitles,
  ensureTopicIpProfile,
  getHotTopicSources,
  loadTopicGenerationContext,
} from "./topic-generation-request"

/**
 * 选题生成与落库的服务层。
 *
 * 从 `topics/generate` 路由抽出「加载上下文 → 组装来源 → 调模型 → 落 TopicSelection」，
 * 让 HTTP 路由与每日推送 cron 共用同一条生成链路，避免第二套实现。
 */

export interface TopicSelectionGenerationInput {
  userId: string
  /** 已解析并校验过的项目 ID（调用方负责 resolveBoundProject）。 */
  projectId: string
  knowledgeEntryIds: string[]
  forcedElementCodes?: string[]
  recommendationMode: RecommendationMode
  refreshCount?: number
  requestId: string
  /** 单测可注入主编评审替身；生产默认走真实 LLM，失败由评审函数静默降级。 */
  reviewer?: TopicEditorReviewer
}

export type TopicSelectionGenerationResult =
  | {
      ok: true
      selectionId: string
      cards: TopicCard[]
      elementCodes: string[]
      strategy: string
      sourceHighlights: TopicSource[]
      /** true = 模型链全败，cards 是降级模板，前端必须提示重新生成 */
      degraded: boolean
      /** 实际使用的模型标签；降级时以 ":fallback" 结尾 */
      model?: string
    }
  | { ok: false; status: number; error: string }

type TopicGenerationContext = Awaited<ReturnType<typeof loadTopicGenerationContext>>
type ProjectRecord = NonNullable<TopicGenerationContext[0]>
type ElementRecord = TopicGenerationContext[1][number]
type KnowledgeRecord = TopicGenerationContext[3][number]
type WatchAccountRecord = TopicGenerationContext[5][number]
type VideoCopyRecord = TopicGenerationContext[6][number]

interface TopicSourceBundle {
  projectSource: TopicSource | null
  topicSources: TopicSource[]
  benchmarkSources: TopicSource[]
  videoCopySources: TopicSource[]
  hotTopicSources: TopicSource[]
}

/** 组装选题来源：项目基准线 → 对标账号 → 拆解文案 → 当日热点。 */
async function buildTopicSourceBundle(input: {
  project: ProjectRecord
  selectedKnowledge: KnowledgeRecord[]
  watchAccounts: WatchAccountRecord[]
  videoCopyExtractions: VideoCopyRecord[]
}): Promise<TopicSourceBundle> {
  const projectSource = buildProjectSource(input.project)
  const hotTopicSources = await getHotTopicSources()
  const benchmarkSources = buildBenchmarkAccountSources(input.watchAccounts)
  const videoCopySources = buildVideoCopyExtractionSources(input.videoCopyExtractions)

  return {
    projectSource,
    benchmarkSources,
    videoCopySources,
    hotTopicSources,
    topicSources: buildTopicSources({
      projectSource,
      selectedKnowledge: input.selectedKnowledge,
      benchmarkSources,
      videoCopySources,
      hotTopicSources,
    }),
  }
}

/** 落库为一条 TopicSelection，返回记录 ID。 */
async function persistTopicSelection(input: {
  userId: string
  projectId: string
  ipProfileId: string
  elementCodes: string[]
  cards: TopicCard[]
  sourceHighlights: TopicSource[]
  promptText: string
  model?: string | null
  recommendationMode: RecommendationMode
}): Promise<string> {
  const selection = await prisma.topicSelection.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      ipProfileId: input.ipProfileId,
      elementCodes: input.elementCodes as unknown as Prisma.InputJsonValue,
      candidates: input.cards as unknown as Prisma.InputJsonValue,
      sourceHighlights: input.sourceHighlights as unknown as Prisma.InputJsonValue,
      promptText: input.promptText,
      model: input.model,
      status: "pending",
      recommendationMode: input.recommendationMode,
      recommendedDate: new Date().toISOString().split("T")[0],
    },
  })
  return selection.id
}

/** 组装好的生成输入；富信号失败时可退回「项目基准线 + 选题池」重试。 */
interface GenerationAttempt {
  elements: ElementRecord[]
  topicIpProfile: Parameters<typeof generateTopicCards>[0]["ipProfile"]
  recommendationMode: RecommendationMode
  forcedElementCodes?: string[]
  recentElementSets: string[][]
  recentTitles: string[]
  refreshCount: number
  contentThemes: Parameters<typeof generateTopicCards>[0]["contentThemes"]
  userId: string
}

/**
 * 调用模型生成候选；带富信号（对标/拆解/热点）的一次失败时，退回基础来源重试一次。
 * 两次都失败才向上返回失败，避免因单条外部信号污染整次生成。
 */
async function generateCardsWithFallback(input: {
  attempt: GenerationAttempt
  topicSources: TopicSource[]
  baseSources: TopicSource[]
  hasEnrichedSignals: boolean
  requestId: string
}) {
  let result = await generateTopicCards({ ...input.attempt, topicSources: input.topicSources })
  if (!result.success && input.hasEnrichedSignals) {
    console.warn(
      `[${input.requestId}] Enriched topic generation failed, retrying with base sources: ${result.error}`,
    )
    result = await generateTopicCards({ ...input.attempt, topicSources: input.baseSources })
  }
  return result
}

/** 加载生成上下文并做前置校验；不满足条件时直接返回可上抛的错误结果。 */
async function loadValidatedContext(input: TopicSelectionGenerationInput) {
  const [project, elements, recentSelections, selectedKnowledge, ipProfile, watchAccounts, videoCopyExtractions, accountHistory] =
    await loadTopicGenerationContext({
      userId: input.userId,
      projectId: input.projectId,
      knowledgeEntryIds: input.knowledgeEntryIds,
      requestId: input.requestId,
    })

  if (!project) {
    return { ok: false as const, status: 404, error: "客户项目不存在或已归档" }
  }
  if (elements.length < 2) {
    console.error(`[${input.requestId}] Insufficient topic elements: ${elements.length}`)
    return { ok: false as const, status: 500, error: "系统数据未就绪，请稍后再试" }
  }

  return {
    ok: true as const,
    project,
    elements,
    recentSelections,
    selectedKnowledge,
    ipProfile,
    watchAccounts,
    videoCopyExtractions,
    accountHistory,
  }
}

/** 独立主编评审后落库；评审失败时卡片原样入库，不阻断生成。 */
async function reviewAndPersistSelection(input: {
  userId: string
  projectId: string
  projectName: string
  ipProfileId: string
  watchAccounts: WatchAccountRecord[]
  result: Extract<Awaited<ReturnType<typeof generateCardsWithFallback>>, { success: true }>
  topicSources: TopicSource[]
  recommendationMode: RecommendationMode
  reviewer?: TopicEditorReviewer
  requestId: string
}) {
  const cards = await evaluateTopicCards(
    input.result.cards,
    {
      projectName: input.projectName,
      competitorEvidence: selectTopCompetitorEvidence(input.watchAccounts),
    },
    input.reviewer,
  )
  const sourceHighlights = input.topicSources.slice(0, 16)
  const selectionId = await persistTopicSelection({
    userId: input.userId,
    projectId: input.projectId,
    ipProfileId: input.ipProfileId,
    elementCodes: input.result.elementCodes,
    cards,
    sourceHighlights,
    promptText: input.result.promptText,
    model: input.result.model,
    recommendationMode: input.recommendationMode,
  })
  console.log(`[${input.requestId}] TopicSelection created: ${selectionId}, strategy=${input.result.strategy}`)
  return {
    selectionId,
    cards,
    sourceHighlights,
    degraded: input.result.degraded === true,
    model: input.result.model,
  }
}

function prependAccountHistorySource(
  bundle: { topicSources: Array<{ category: string; title: string; content: string }> },
  block: string,
) {
  if (!block) return
  bundle.topicSources = [
    {
      category: "account_history",
      title: "账号真实发布历史",
      content: block.slice(0, 1200),
    },
    ...bundle.topicSources,
  ]
}

/**
 * @description 生成一批选题并落库为 TopicSelection
 * @param input - 生成入参（用户、项目、知识条目、元素、推荐模式）
 * @returns 成功返回记录 ID 与候选卡；失败返回可供路由直接转 HTTP 的状态码与文案
 */
export async function generateAndStoreTopicSelection(
  input: TopicSelectionGenerationInput,
): Promise<TopicSelectionGenerationResult> {
  const { userId, projectId, forcedElementCodes, recommendationMode } = input
  const refreshCount = input.refreshCount ?? 0

  const context = await loadValidatedContext(input)
  if (!context.ok) return context
  const { project, elements, recentSelections, selectedKnowledge } = context
  const { ipProfile, watchAccounts, videoCopyExtractions, accountHistory } = context

  const recentElementSets = deriveRecentElementSets(recentSelections)
  const recentTitles = deriveRecentTitles(recentSelections)
  const bundle = await buildTopicSourceBundle({
    project,
    selectedKnowledge,
    watchAccounts,
    videoCopyExtractions,
  })
  prependAccountHistorySource(bundle, accountHistory.block)
  const { ipProfileRecord, contentThemes, topicIpProfile } = await ensureTopicIpProfile({
    userId,
    project,
    existing: ipProfile,
  })

  const startTime = Date.now()
  const result = await generateCardsWithFallback({
    attempt: {
      elements,
      topicIpProfile,
      recommendationMode,
      forcedElementCodes,
      recentElementSets,
      recentTitles,
      refreshCount,
      contentThemes,
      userId,
    },
    topicSources: bundle.topicSources,
    baseSources: [...(bundle.projectSource ? [bundle.projectSource] : []), ...selectedKnowledge],
    hasEnrichedSignals:
      bundle.benchmarkSources.length > 0
      || bundle.videoCopySources.length > 0
      || bundle.hotTopicSources.length > 0,
    requestId: input.requestId,
  })
  console.log(`[${input.requestId}] Generation completed in ${Date.now() - startTime}ms, success=${result.success}`)

  if (!result.success) {
    return { ok: false, status: 500, error: result.error }
  }

  const stored = await reviewAndPersistSelection({
    userId,
    projectId,
    projectName: project.name,
    ipProfileId: ipProfileRecord.id,
    watchAccounts,
    result,
    topicSources: bundle.topicSources,
    recommendationMode,
    reviewer: input.reviewer,
    requestId: input.requestId,
  })

  return {
    ok: true,
    ...stored,
    elementCodes: result.elementCodes,
    strategy: result.strategy,
  }
}
