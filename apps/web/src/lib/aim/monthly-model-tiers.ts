/**
 * 月度模型档位推荐（WP-3.4）。
 *
 * 只给人审看，不改路由表，不做实时调度。
 * 输入：route key + 评测均分 + 成本；输出：保持 / 降档 / 人工复核。
 */

export interface MonthlyModelRouteScore {
  routeKey: string
  rubricMean: number | null
  costCny: number | null
}

export interface MonthlyModelTierRecommendation {
  routeKey: string
  recommended: "keep" | "downgrade" | "review"
  reason: string
}

export function recommendMonthlyModelTiers(
  rows: MonthlyModelRouteScore[],
): MonthlyModelTierRecommendation[] {
  return rows.map((row) => {
    if (row.rubricMean == null) {
      return { routeKey: row.routeKey, recommended: "review", reason: "没有评测均分，不能自动改档" }
    }
    if (row.rubricMean < 70) {
      return { routeKey: row.routeKey, recommended: "review", reason: "均分低于 70，先人看再决定" }
    }
    if (row.costCny != null && row.costCny > 0.2 && row.rubricMean < 85) {
      return { routeKey: row.routeKey, recommended: "downgrade", reason: "成本偏高且均分未到 85，建议人审后降档" }
    }
    return { routeKey: row.routeKey, recommended: "keep", reason: "均分达标，维持当前档" }
  })
}
