import type {
  OpportunityItem,
  ScoreBreakdown,
  ScoreConfidence,
} from "../contracts/types"

// ─── Scoring Weights (configurable) ──────────────────────

const WEIGHTS = {
  freshness: 0.2,
  engagementRate: 0.25,
  relativeBurst: 0.25,
  crossPlatform: 0.15,
  projectMatch: 0.15,
} as const

// ─── Main Entry ──────────────────────────────────────────

export function scoreOpportunityItems(
  items: OpportunityItem[],
  keyword: string,
): OpportunityItem[] {
  // Detect cross-platform duplicates for scoring
  const titleGroups = groupByNormalizedTitle(items)

  return items.map((item) => {
    const { score, confidence, breakdown } = computeScore(
      item,
      keyword,
      titleGroups,
    )
    return {
      ...item,
      opportunityScore: score,
      scoreConfidence: confidence,
      scoreBreakdown: breakdown,
    }
  })
}

// ─── Score Computation ───────────────────────────────────

function computeScore(
  item: OpportunityItem,
  keyword: string,
  titleGroups: Map<string, OpportunityItem[]>,
): { score: number; confidence: ScoreConfidence; breakdown: ScoreBreakdown } {
  const availableSignals: string[] = []
  const missingSignals: string[] = []

  // 1. Freshness (24h = 1.0, 7d decay to 0.3, 30d = 0.1)
  let freshness = 0.5 // default when no date
  if (item.publishedAt) {
    const ageMs = Date.now() - new Date(item.publishedAt).getTime()
    const ageHours = ageMs / (1000 * 60 * 60)
    if (ageHours <= 24) freshness = 1.0
    else if (ageHours <= 168) freshness = Math.max(0.3, 1.0 - (ageHours - 24) / 144 * 0.7)
    else if (ageHours <= 720) freshness = Math.max(0.1, 0.3 - (ageHours - 168) / 552 * 0.2)
    else freshness = 0.05
    availableSignals.push("freshness")
  } else {
    missingSignals.push("freshness")
  }

  // 2. Engagement rate (interactions / views)
  let engagementRate = 0
  const views = item.metrics.views
  const interactions =
    (item.metrics.likes ?? 0) +
    (item.metrics.comments ?? 0) +
    (item.metrics.shares ?? 0)
  if (views && views > 0) {
    const rate = interactions / views
    // Normalize: 5% engagement = 0.5, 10%+ = 1.0
    engagementRate = Math.min(1.0, rate / 0.1)
    availableSignals.push("engagementRate")
  } else if (interactions > 0) {
    // No views but has interactions — use absolute interactions as proxy
    engagementRate = Math.min(1.0, interactions / 10000)
    availableSignals.push("engagementRate")
  } else {
    missingSignals.push("engagementRate")
  }

  // 3. Relative burst (interactions / follower count)
  let relativeBurst = 0
  const followers = item.author.followerCount
  if (followers && followers > 0 && interactions > 0) {
    const burstRatio = interactions / followers
    // Normalize: ratio > 1 means content outperformed follower base
    relativeBurst = Math.min(1.0, burstRatio / 2)
    availableSignals.push("relativeBurst")
  } else {
    missingSignals.push("relativeBurst")
  }

  // 4. Cross-platform presence
  let crossPlatform = 0
  const titleKey = normalizeTitle(item.title)
  if (titleKey) {
    const group = titleGroups.get(titleKey)
    if (group && group.length > 1) {
      const platforms = new Set(group.map((g) => g.platform))
      crossPlatform = platforms.size > 1 ? 1.0 : 0.3
    }
    availableSignals.push("crossPlatform")
  } else {
    missingSignals.push("crossPlatform")
  }

  // 5. Project match (keyword presence in title)
  let projectMatch = 0.5 // neutral default
  if (keyword) {
    const kw = keyword.toLowerCase()
    const title = item.title.toLowerCase()
    if (title.includes(kw)) {
      projectMatch = 1.0
    } else {
      // Partial keyword match
      const kwChars = kw.split("")
      const matchRatio = kwChars.filter((c) => title.includes(c)).length / kwChars.length
      projectMatch = matchRatio > 0.6 ? 0.7 : 0.3
    }
    availableSignals.push("projectMatch")
  } else {
    missingSignals.push("projectMatch")
  }

  // ─── Weighted sum with re-normalization ──────────────
  const signals = { freshness, engagementRate, relativeBurst, crossPlatform, projectMatch }
  const availableWeight = Object.entries(signals)
    .filter(([key]) => !missingSignals.includes(key))
    .reduce((sum, [key]) => sum + WEIGHTS[key as keyof typeof WEIGHTS], 0)

  let score: number
  if (availableWeight > 0) {
    const weightedSum = Object.entries(signals).reduce((sum, [key, value]) => {
      if (missingSignals.includes(key)) return sum
      return sum + value * WEIGHTS[key as keyof typeof WEIGHTS]
    }, 0)
    score = Math.round((weightedSum / availableWeight) * 100) / 100
  } else {
    score = 0
  }

  // Confidence based on available signals
  const confidence: ScoreConfidence =
    availableSignals.length >= 4 ? "high" :
    availableSignals.length >= 2 ? "medium" : "low"

  return {
    score,
    confidence,
    breakdown: {
      freshness,
      engagementRate,
      relativeBurst,
      crossPlatform,
      projectMatch,
      availableSignals,
      missingSignals,
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────

function groupByNormalizedTitle(items: OpportunityItem[]): Map<string, OpportunityItem[]> {
  const groups = new Map<string, OpportunityItem[]>()
  for (const item of items) {
    const key = normalizeTitle(item.title)
    if (!key) continue
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  return groups
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[#@]\S+/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 30)
}
