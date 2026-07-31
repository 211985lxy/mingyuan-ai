export interface ModelTokenPrices { input: number; output: number; cached?: number }

const PRICES: Record<string, ModelTokenPrices> = {
  // 2026-07-31 起 deepseek-v4-flash 正式版上线；deepseek-chat/reasoner 已停用，保留兼容旧账单
  "deepseek|deepseek-v4-flash": { input: 3, output: 6, cached: 0.1 },
  "deepseek|deepseek-v4-pro": { input: 3, output: 6, cached: 0.1 },
  "deepseek|deepseek-chat": { input: 3, output: 6, cached: 0.1 },
  "doubao|doubao-seed-2-1-pro-260628": { input: 6, output: 30, cached: 1.2 },
  "doubao|doubao-seed-2-1-turbo-260628": { input: 3, output: 15, cached: 0.6 },
  "openrouter|qwen/qwen3.7-plus": { input: 5, output: 15 },
  "openrouter|moonshotai/kimi-k2.6": { input: 14, output: 56 },
  "lihuo|gpt-5.6": { input: 36, output: 216, cached: 3.6 },
}

function resolvePrices(provider?: string, model?: string): ModelTokenPrices {
  const exact = provider && model ? PRICES[`${provider}|${model}`] : undefined
  if (exact) return exact
  const name = (model ?? "").toLowerCase()
  if (name.includes("doubao") || name.includes("seed")) return name.includes("pro") ? PRICES["doubao|doubao-seed-2-1-pro-260628"] : PRICES["doubao|doubao-seed-2-1-turbo-260628"]
  if (name.includes("deepseek")) return PRICES["deepseek|deepseek-v4-flash"]
  if (name.includes("kimi")) return PRICES["openrouter|moonshotai/kimi-k2.6"]
  return { input: 5, output: 20 }
}

/**
 * @description 计算costcny
 * @param provider - provider
 * @param model - 模型
 * @param usage - usage
 * @returns number | undefined
 */
export function computeCostCny(provider: string | undefined, model: string | undefined, usage: { inputTokens?: number; outputTokens?: number; cachedTokens?: number }): number | undefined {
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) return undefined
  const prices = resolvePrices(provider, model)
  const cached = Math.min(usage.cachedTokens ?? 0, usage.inputTokens ?? 0)
  const cost = ((usage.inputTokens ?? 0) - cached) * prices.input / 1_000_000 + cached * (prices.cached ?? prices.input) / 1_000_000 + (usage.outputTokens ?? 0) * prices.output / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}
