import { prisma } from "@/lib/prisma"
import type { RecommendationMode } from "@/lib/topic-generation"
import { getTodayAiHotBriefing } from "@/lib/aihot-briefing"
import { VALID_ELEMENT_CODES } from "@/lib/topic-validation"
import type { TopicCard } from "@/lib/topic-validation"
import { hasConflict } from "@/lib/topic-element-logic"
import type { ContentTheme } from "@/types/api"
import { TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS } from "@/features/topics/contracts/api"
import { getLatestHotList } from "@/lib/douyin-hot"
import { decideDouyinItems, decideLast30DaysItems, type HotDecisionItem } from "@/lib/hot-decisions"
import { getLatestMarketHotSnapshot } from "@/lib/market-insights/market-hotlist"
import type { TopicSource } from "@/lib/topic-source-builders"

/**
 * topics/generate 路由的请求准备逻辑（从 route.ts 抽出，保持路由文件薄）：
 * 元素校验、上下文加载、历史去重集合与 IP 档案兜底。
 */

const RECOMMENDATION_MODES = new Set<RecommendationMode>(["normal", "daily", "weekly"])

export function parseRecommendationMode(value: unknown): RecommendationMode | null {
  if (value == null) return "normal"
  return typeof value === "string" && RECOMMENDATION_MODES.has(value as RecommendationMode)
    ? (value as RecommendationMode)
    : null
}

/**
 * 各热点来源进入选题生成的条数上限。
 * 抖音热榜是实时榜（借势价值最高）给最多，市场热榜与 AI 简报作为补充，避免 prompt 无限膨胀。
 */
const HOT_SOURCE_LIMITS = { douyin: 6, market: 4, aihot: 4 } as const

/** 把已通过热度决策的热点条目渲染成选题来源行，带上评分与判断理由供选题阶段借势。 */
function hotDecisionToSource(item: HotDecisionItem): TopicSource {
  return {
    category: "industry_hot",
    title: item.title,
    content: [
      `${item.sourceName || item.platform}｜热度 ${item.score} 分｜${item.verdictLabel}`,
      item.summary,
      item.reason,
      item.url,
    ].filter(Boolean).join("｜"),
  }
}

/**
 * @description 取当日热点作为选题的「借势」来源：抖音热榜 + 市场热榜 + AI 简报
 *  - 抖音与市场两条先过 hot-decisions 的准入判断（评分与避雷），避免无关娱乐热搜污染选题
 *  - 单一来源失败只降级该来源，不阻断整体生成
 * @returns Promise<TopicSource[]>
 */
export async function getHotTopicSources(): Promise<TopicSource[]> {
  const [douyin, market, aihot] = await Promise.all([
    getLatestHotList()
      .then((items) => decideDouyinItems(items).slice(0, HOT_SOURCE_LIMITS.douyin).map(hotDecisionToSource))
      .catch((error) => {
        console.warn("[topic-gen] douyin hot unavailable:", error)
        return [] as TopicSource[]
      }),
    getLatestMarketHotSnapshot()
      .then((snapshot) =>
        decideLast30DaysItems(snapshot.items).slice(0, HOT_SOURCE_LIMITS.market).map(hotDecisionToSource),
      )
      .catch((error) => {
        console.warn("[topic-gen] market hot unavailable:", error)
        return [] as TopicSource[]
      }),
    getTodayAiHotBriefing()
      .then((briefing) =>
        briefing.items.slice(0, HOT_SOURCE_LIMITS.aihot).map((item) => ({
          category: "industry_hot",
          title: item.title,
          content: `${item.categoryLabel}｜${item.summary}｜${item.url}`,
        })),
      )
      .catch((error) => {
        console.warn("[topic-gen] AIHOT briefing unavailable:", error)
        return [] as TopicSource[]
      }),
  ])

  return [...douyin, ...market, ...aihot]
}

export type ForcedElementCodesResult =
  | { ok: true; codes: string[] | undefined }
  | { ok: false; error: string }

/** 校验用户强制指定的选题元素：合法码、去重后 2-3 个、彼此不冲突。 */
export function resolveForcedElementCodes(raw: unknown): ForcedElementCodesResult {
  if (!Array.isArray(raw)) return { ok: true, codes: undefined }
  const candidates = raw as string[]
  const validSet = new Set<string>(VALID_ELEMENT_CODES)

  const invalid = candidates.filter((c) => !validSet.has(c))
  if (invalid.length > 0) {
    return { ok: false, error: `非法的元素代码: ${invalid.join(", ")}` }
  }

  const deduped = [...new Set(candidates)]
  if (deduped.length < 2 || deduped.length > 3) {
    return { ok: false, error: "元素数量必须为2或3个（去重后）" }
  }

  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      if (hasConflict(deduped[i], deduped[j])) {
        return { ok: false, error: `元素冲突: ${deduped[i]} 和 ${deduped[j]} 不可同时使用` }
      }
    }
  }

  return { ok: true, codes: deduped }
}

function listWatchAccounts(userId: string, projectId: string, requestId: string) {
  return prisma.watchAccount.findMany({
    where: { userId, projectId },
    orderBy: { lastRefreshedAt: "desc" },
    take: 12,
    select: {
      nickname: true,
      targetUrl: true,
      latestVideos: true,
      viralVideos: true,
    },
  }).catch((error) => {
    console.warn(`[${requestId}] Watch account sources unavailable:`, error)
    return []
  })
}

function listCompletedVideoCopyExtractions(userId: string, projectId: string, requestId: string) {
  return prisma.videoCopyExtraction.findMany({
    where: {
      userId,
      projectId,
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    take: 8,
    select: {
      videoTitle: true,
      sourceUrl: true,
      transcript: true,
      analysisResult: true,
    },
  }).catch((error) => {
    console.warn(`[${requestId}] Video copy extraction sources unavailable:`, error)
    return []
  })
}

/** 一次并发取齐选题生成所需的全部上下文；可降级的数据源失败时返回空数组。 */
export function loadTopicGenerationContext(input: {
  userId: string
  projectId: string
  knowledgeEntryIds: string[]
  requestId: string
}) {
  const { userId, projectId, knowledgeEntryIds, requestId } = input
  return Promise.all([
    projectId
      ? prisma.clientProject.findFirst({
          where: { id: projectId, userId, status: "active" },
          select: {
            id: true,
            name: true,
            industry: true,
            targetCustomer: true,
            offer: true,
            deliveryGoal: true,
          },
        })
      : Promise.resolve(null),
    prisma.topicElement.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      take: 200,
    }),
    // Fetch last 5 topic generations for history-aware derivation
    prisma.topicSelection.findMany({
      where: { userId, projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { elementCodes: true, candidates: true },
    }),
    knowledgeEntryIds.length > 0
      ? prisma.knowledgeEntry.findMany({
          where: {
            id: { in: knowledgeEntryIds },
            userId,
            status: "active",
            ...(projectId ? { projectId } : {}),
          },
          select: { category: true, title: true, content: true },
          take: TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS,
        })
      : Promise.resolve([]),
    // Fetch IpProfile for content line themes (降级：不存在时跳过)
    prisma.ipProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        displayName: true,
        nickname: true,
        industry: true,
        primaryOffer: true,
        targetAudience: true,
        ipTraits: true,
        toneOfVoice: true,
        proofPoints: true,
        callToAction: true,
        promptSnapshot: true,
        content: true,
      },
    }).catch(() => null),
    listWatchAccounts(userId, projectId, requestId),
    listCompletedVideoCopyExtractions(userId, projectId, requestId),
  ])
}

type RecentSelection = { elementCodes: unknown; candidates: unknown }

export function deriveRecentElementSets(recentSelections: RecentSelection[]): string[][] {
  return recentSelections
    .map((s) => {
      const codes = s.elementCodes
      return Array.isArray(codes) ? (codes as string[]) : []
    })
    .filter((s) => s.length > 0)
}

export function deriveRecentTitles(recentSelections: RecentSelection[]): string[] {
  return recentSelections.flatMap((s) => {
    const candidates = s.candidates
    if (!Array.isArray(candidates)) return []
    return (candidates as unknown as TopicCard[])
      .map((c) => c.title)
      .filter(Boolean)
  })
}

type IpProfileRecord = {
  id: string
  displayName: string | null
  nickname: string | null
  industry: string | null
  primaryOffer: string | null
  targetAudience: string | null
  ipTraits: string | null
  toneOfVoice: string | null
  proofPoints: string | null
  callToAction: string | null
  promptSnapshot: string | null
  content: unknown
}

/**
 * Extract content line themes from IpProfile (降级：无定位时 themes 为空)。
 * 没有档案时用项目信息创建一个未完成档案，保证本次生成有归属。
 */
export async function ensureTopicIpProfile(input: {
  userId: string
  project: { name: string | null; industry: string | null; offer: string | null; targetCustomer: string | null } | null
  existing: IpProfileRecord | null
}) {
  const record = input.existing ?? await prisma.ipProfile.create({
    data: {
      userId: input.userId,
      displayName: input.project?.name ?? "未命名 IP",
      industry: input.project?.industry,
      primaryOffer: input.project?.offer,
      targetAudience: input.project?.targetCustomer,
      isComplete: false,
      isActive: true,
    },
  })
  const contentRaw = record.content as { themes?: ContentTheme[] } | null
  return {
    ipProfileRecord: record,
    contentThemes: Array.isArray(contentRaw?.themes) ? contentRaw.themes : [],
    topicIpProfile: {
      id: record.id,
      displayName: record.displayName,
      nickname: record.nickname,
      industry: record.industry,
      primaryOffer: record.primaryOffer,
      targetAudience: record.targetAudience,
      ipTraits: record.ipTraits,
      toneOfVoice: record.toneOfVoice,
      proofPoints: record.proofPoints,
      callToAction: record.callToAction,
      promptSnapshot: record.promptSnapshot,
      content: record.content,
    },
  }
}
