import { prisma } from "@/lib/prisma"
import type { HotTopic } from "@/types/content-template"
import type { ApiHotTopicInsight } from "@/types/api"
import { fetchSearchEvidence } from "./evidence"
import { parseInsight, parseSearchEvidence, serializeHotTopic } from "./formatting"
import { generateInsight } from "./insight-generation"
import { acquireSingleFlightLock, buildInsightLockKey, releaseSingleFlightLock, waitForInsightCache } from "./locks"
import { HotTopicIntelligenceError, INSIGHT_FAILURE_COOLDOWN_MS, MIN_EVIDENCE_COUNT, type TopicRow } from "./types"

/**
 * @description 获取最新的hottopicbyid
 * @param topicId - 主题唯一标识符
 * @returns Promise<TopicRow>
 */
export async function getLatestHotTopicById(topicId: string): Promise<TopicRow> {
  const latestSnapshot = await prisma.douyinHotSnapshot.findFirst({
    where: { status: "success" },
    orderBy: { fetchedAt: "desc" },
    select: { batchId: true },
  })

  if (!latestSnapshot) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_NOT_FOUND",
      "当前没有可用热点数据",
      404,
    )
  }

  const topic = await prisma.douyinHotItem.findFirst({
    where: {
      batchId: latestSnapshot.batchId,
      sentenceId: topicId,
    },
    select: {
      id: true,
      sentenceId: true,
      word: true,
      hotValue: true,
      position: true,
      label: true,
      videoCount: true,
      coverUrl: true,
      eventTime: true,
      fetchedAt: true,
      batchId: true,
      searchSnapshot: true,
      insightStatus: true,
      insightJson: true,
      insightError: true,
      insightUpdatedAt: true,
    },
  })

  if (!topic) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_NOT_FOUND",
      "所选热点不存在或已过期",
      404,
    )
  }

  return topic
}

/**
 * @description 获取orgeneratehottopicinsight
 * @param topicId - 主题唯一标识符
 * @returns Promise<
 */
export async function getOrGenerateHotTopicInsight(
  topicId: string,
): Promise<{ topic: HotTopic; insight: ApiHotTopicInsight }> {
  const topic = await getLatestHotTopicById(topicId)
  const cached = parseInsight(topic.insightJson)
  const cachedEvidence = parseSearchEvidence(topic.searchSnapshot)

  if (topic.insightStatus === "ready" && cached) {
    return {
      topic: serializeHotTopic(topic),
      insight: cached,
    }
  }

  throwIfRecentInsightFailure(topic)

  const lockKey = buildInsightLockKey(topic)
  const acquiredLock = await acquireSingleFlightLock(lockKey)
  const evidenceState = { current: cachedEvidence }

  if (!acquiredLock) {
    const waitedInsight = await waitForInsightCache(topic.id)
    if (waitedInsight) {
      return {
        topic: serializeHotTopic(topic),
        insight: waitedInsight,
      }
    }
  }

  try {
    const insight = await refreshOrGenerateInsight(topic, evidenceState)
    return { topic: serializeHotTopic(topic), insight }
  } catch (error) {
    await persistInsightFailure(topic.id, evidenceState.current, error)
    throw error
  } finally {
    if (acquiredLock) {
      await releaseSingleFlightLock(lockKey)
    }
  }
}

function throwIfRecentInsightFailure(input: {
  insightStatus: string
  insightUpdatedAt: Date | null
  insightError: string | null
}): void {
  if (input.insightStatus !== "failed" || !input.insightUpdatedAt) return
  if (Date.now() - input.insightUpdatedAt.getTime() >= INSIGHT_FAILURE_COOLDOWN_MS) return
  throw new HotTopicIntelligenceError("HOT_TOPIC_INSIGHT_RECENTLY_FAILED", input.insightError || "热点洞察生成失败，请稍后再试", 503)
}

async function refreshOrGenerateInsight(
  topic: TopicRow,
  evidenceState: { current: ReturnType<typeof parseSearchEvidence> },
): Promise<ApiHotTopicInsight> {
  const freshState = await prisma.douyinHotItem.findUnique({
    where: { id: topic.id },
    select: { insightStatus: true, insightJson: true, insightError: true, insightUpdatedAt: true },
  })
  const refreshed = parseInsight(freshState?.insightJson)
  if (freshState?.insightStatus === "ready" && refreshed) return refreshed
  if (freshState) throwIfRecentInsightFailure(freshState)
  if (evidenceState.current.length < MIN_EVIDENCE_COUNT) {
    evidenceState.current = await fetchSearchEvidence(topic.word)
  }
  const insight = await generateInsight(topic, evidenceState.current)
  await prisma.douyinHotItem.update({
    where: { id: topic.id },
    data: { searchSnapshot: JSON.parse(JSON.stringify(evidenceState.current)), insightStatus: "ready", insightJson: JSON.parse(JSON.stringify(insight)), insightError: null, insightUpdatedAt: new Date() },
  })
  return insight
}

async function persistInsightFailure(topicId: string, evidence: ReturnType<typeof parseSearchEvidence>, error: unknown): Promise<void> {
  await prisma.douyinHotItem.update({
    where: { id: topicId },
    data: {
      ...(evidence.length > 0 ? { searchSnapshot: JSON.parse(JSON.stringify(evidence)) } : {}),
      insightStatus: "failed",
      insightError: error instanceof Error ? error.message : "热点洞察生成失败",
      insightUpdatedAt: new Date(),
    },
  })
}
