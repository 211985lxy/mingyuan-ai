import { prisma } from "@/lib/prisma"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"
import { buildFitCacheKey, parseFit } from "./formatting"
import { evaluateHotTopicFitUncached } from "./fit-evaluator"
import { acquireSingleFlightLock, buildFitLockKey, releaseSingleFlightLock, waitForFitCache } from "./locks"
import type { FitInput } from "./types"

export async function evaluateHotTopicFit(
  input: FitInput,
): Promise<ApiHotTopicFit> {
  const ipSnapshot = input.ipProfile?.promptSnapshot || ""
  const cacheKey = buildFitCacheKey(input, ipSnapshot)
  const cachedFit = await prisma.hotTopicFitCache.findUnique({
    where: { cacheKey },
    select: { fitJson: true },
  })
  const parsedCachedFit = parseFit(cachedFit?.fitJson)

  if (parsedCachedFit) {
    return parsedCachedFit
  }

  const lockKey = buildFitLockKey(cacheKey)
  const acquiredLock = await acquireSingleFlightLock(lockKey)

  if (!acquiredLock) {
    const waitedFit = await waitForFitCache(cacheKey)
    if (waitedFit) {
      return waitedFit
    }
  }

  try {
    const freshCachedFit = await prisma.hotTopicFitCache.findUnique({
      where: { cacheKey },
      select: { fitJson: true },
    })
    const parsedFreshCachedFit = parseFit(freshCachedFit?.fitJson)

    if (parsedFreshCachedFit) {
      return parsedFreshCachedFit
    }

    const fit = await evaluateHotTopicFitUncached(input, ipSnapshot)

    await prisma.hotTopicFitCache.upsert({
      where: { cacheKey },
      update: {
        topicTitle: input.topicTitle,
        fitJson: JSON.parse(JSON.stringify(fit)),
      },
      create: {
        cacheKey,
        topicId: input.insight.topicId,
        topicTitle: input.topicTitle,
        templateId: input.template.id,
        structureId: input.structure.id,
        ipProfileId: input.ipProfile?.id || "",
        fitJson: JSON.parse(JSON.stringify(fit)),
      },
    })

    return fit
  } finally {
    if (acquiredLock) {
      await releaseSingleFlightLock(lockKey)
    }
  }
}

export function buildHotTopicPromptSection(
  insight: ApiHotTopicInsight,
  fit: ApiHotTopicFit,
): string {
  return [
    "【热点洞察】",
    `热点标题：${insight.title}`,
    `事件摘要：${insight.summary}`,
    `爆火原因：${insight.whyTrending}`,
    `营销母题：${insight.marketingThemes.join("、") || "无"}`,
    `风险等级：${insight.riskLevel}`,
    `不建议角度：${insight.notRecommendedAngles.join("；") || "无"}`,
    `新鲜度：${insight.freshnessNote}`,
    "",
    "【热点适配结论】",
    `适配度：${fit.score} / 100（${fit.verdict}）`,
    `适配总结：${fit.fitSummary}`,
    `桥接理由：${fit.bridgeReason}`,
    `建议角度：${fit.recommendedAngle}`,
    `建议开场：${fit.recommendedHook}`,
    `CTA 方向：${fit.ctaDirection}`,
    `注意事项：${fit.caution.join("；") || "无"}`,
    "",
  ].join("\n")
}
