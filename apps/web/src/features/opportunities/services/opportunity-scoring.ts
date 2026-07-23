import type { OpportunityItem, ScoreBreakdown } from "../contracts/types"

// ─── 权重配置 ──────────────────────────────────────────────

const WEIGHTS = {
  freshness: 0.20,
  engagement: 0.25,
  burst: 0.25,
  crossPlatform: 0.15,
  projectMatch: 0.15,
}

// ─── 评分入口 ──────────────────────────────────────────────

export function scoreItems(items: OpportunityItem[]): OpportunityItem[] {
  if (items.length === 0) return items

  // 计算全局基准（用于相对爆发计算）
  const medianLikes = median(items.map((i) => i.metrics.likes ?? 0))
  const medianViews = median(items.map((i) => i.metrics.views ?? 0))

  return items
    .map((item) => {
      const breakdown = computeBreakdown(item, medianLikes, medianViews)
      const score =
        breakdown.freshness * WEIGHTS.freshness +
        breakdown.engagement * WEIGHTS.engagement +
        breakdown.burst * WEIGHTS.burst +
        breakdown.crossPlatform * WEIGHTS.crossPlatform +
        breakdown.projectMatch * WEIGHTS.projectMatch

      return {
        ...item,
        opportunityScore: Math.round(score * 1000) / 1000,
        scoreBreakdown: breakdown,
      }
    })
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
}

// ─── 各维度计算 ────────────────────────────────────────────

function computeBreakdown(
  item: OpportunityItem,
  medianLikes: number,
  medianViews: number,
): ScoreBreakdown {
  return {
    freshness: freshnessScore(item.publishedAt),
    engagement: engagementScore(item),
    burst: burstScore(item, medianLikes, medianViews),
    crossPlatform: 0.5, // 默认中性，跨平台去重后可调整
    projectMatch: 0.5,  // 默认中性，关联项目后可调整
  }
}

/** 新鲜度：7天内满分，30天线性衰减到0.2 */
function freshnessScore(publishedAt?: string): number {
  if (!publishedAt) return 0.3
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays <= 7) return 1.0
  if (ageDays >= 30) return 0.2
  return 1.0 - (ageDays - 7) / 23 * 0.8
}

/** 互动率：(likes + comments*2 + shares*3) / max(views, 1) 归一化 */
function engagementScore(item: OpportunityItem): number {
  const { likes = 0, comments = 0, shares = 0, views } = item.metrics
  const weightedInteractions = likes + comments * 2 + shares * 3
  if (!views || views <= 0) {
    // 无播放量时用绝对互动数估算
    return Math.min(1, weightedInteractions / 10000)
  }
  const rate = weightedInteractions / views
  // 互动率 > 10% 满分，线性映射
  return Math.min(1, rate / 0.10)
}

/** 相对爆发：与同批结果中位数对比 */
function burstScore(item: OpportunityItem, medianLikes: number, medianViews: number): number {
  const likes = item.metrics.likes ?? 0
  const views = item.metrics.views ?? 0

  let score = 0.5
  if (medianLikes > 0) {
    score = Math.min(1, (likes / medianLikes) * 0.4)
  }
  if (medianViews > 0 && views > 0) {
    score = Math.max(score, Math.min(1, (views / medianViews) * 0.4))
  }
  // 低粉爆款加分
  const followers = item.author.followerCount
  if (followers != null && followers < 10000 && likes > 10000) {
    score = Math.min(1, score + 0.3)
  }
  return score
}

// ─── Utils ─────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
