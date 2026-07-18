export interface ModelTokenPrices { input: number; output: number; cached?: number }

const PRICES: Record<string, ModelTokenPrices> = {
  "deepseek|deepseek-chat": { input: 3, output: 6, cached: 0.1 },
  "deepseek|deepseek-v4-pro": { input: 3, output: 6, cached: 0.1 },
  "doubao|doubao-seed-2-1-pro-260628": { input: 6, output: 30, cached: 1.2 },
  "doubao|doubao-seed-2-1-turbo-260628": { input: 3, output: 15, cached: 0.6 },
  "openrouter|qwen/qwen3.7-plus": { input: 5, output: 15 },
  "openrouter|moonshotai/kimi-k2.6": { input: 14, output: 56 },
  "lihuo|gpt-5.5": { input: 36, output: 216, cached: 3.6 },
}

function resolvePrices(provider?: string, model?: string): ModelTokenPrices {
  const exact = provider && model ? PRICES[`${provider}|${model}`] : undefined
  if (exact) return exact
  const name = (model ?? "").toLowerCase()
  if (name.includes("doubao") || name.includes("seed")) return name.includes("pro") ? PRICES["doubao|doubao-seed-2-1-pro-260628"] : PRICES["doubao|doubao-seed-2-1-turbo-260628"]
  if (name.includes("deepseek")) return PRICES["deepseek|deepseek-v4-pro"]
  if (name.includes("kimi")) return PRICES["openrouter|moonshotai/kimi-k2.6"]
  return { input: 5, output: 20 }
}

export function computeCostCny(provider: string | undefined, model: string | undefined, usage: { inputTokens?: number; outputTokens?: number; cachedTokens?: number }): number | undefined {
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) return undefined
  const prices = resolvePrices(provider, model)
  const cached = Math.min(usage.cachedTokens ?? 0, usage.inputTokens ?? 0)
  const cost = ((usage.inputTokens ?? 0) - cached) * prices.input / 1_000_000 + cached * (prices.cached ?? prices.input) / 1_000_000 + (usage.outputTokens ?? 0) * prices.output / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}
