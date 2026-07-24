/**
 * Model-swap 评估启发式（缺口升级 WP-A2）纯函数。
 */

export type ModelSwapBottleneck = "harness_bound" | "model_bound" | "inconclusive"

/**
 * @description 根据强弱模型分数差判定瓶颈标签
 */
export function classifyModelSwapBottleneck(input: {
  strongMean: number | null
  weakMean: number | null
  strongContract: number
  weakContract: number
}): ModelSwapBottleneck {
  if (input.strongContract < 0.999 || input.weakContract < 0.999) return "inconclusive"
  if (input.strongMean === null || input.weakMean === null) return "inconclusive"
  const delta = input.strongMean - input.weakMean
  if (delta < 5) return "harness_bound"
  if (delta >= 12) return "model_bound"
  return "inconclusive"
}
