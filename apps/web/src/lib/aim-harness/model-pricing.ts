/**
 * Model pricing table — RMB yuan per 1,000,000 tokens.
 *
 * Prices here are public-list baselines used for cost observability, not for
 * billing customers. They are deliberately conservative (we'd rather over- than
 * under-estimate). When a provider runs through a 中转/聚合 gateway the real
 * cost differs, so treat `costCny` as an order-of-magnitude signal.
 *
 * Keyed by `<provider>|<model>` (matches agent-router.ts route names) with a
 * model-substring fallback so renamed model ids still resolve.
 *
 * Sources (2026-07):
 *  - DeepSeek 官方: V4-Pro in 3 / out 6 / cached 0.1 ; V4-Flash cheaper
 *    https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 *  - 豆包 doubao 直连（火山引擎 2026-06/23 刊例）:
 *    Seed-2.1-Pro in 6 / out 30 / cached 1.2 ; Turbo 减半 in 3 / out 15 / cached 0.6
 *    https://ark.volcengine.com/region:cn-beijing/model/detail?name=doubao-seed-2-1-pro
 *  - OpenRouter 目录: per-model public pricing
 *  - 离火 lihuo GPT-5.5: 中转价未公开 → TODO 待确认，先用 OpenAI 官方价作上限估计
 */

export interface ModelTokenPrices {
  /** input (cache miss) yuan per 1M tokens */
  input: number
  /** output yuan per 1M tokens */
  output: number
  /** cached input yuan per 1M tokens (DeepSeek/OpenAI prompt cache) */
  cached?: number
}

/** Exact `<provider>|<model>` overrides. */
const EXACT_PRICES: Record<string, ModelTokenPrices> = {
  // ── DeepSeek 直连（官方价）── deepseek-chat 名 2026/07/24 弃用，按 V4-Pro 计
  "deepseek|deepseek-chat": { input: 3, output: 6, cached: 0.1 },
  "deepseek|deepseek-v4-pro": { input: 3, output: 6, cached: 0.1 },
  "deepseek|deepseek-v4-flash": { input: 1, output: 2, cached: 0.05 },

  // ── 豆包 doubao 直连（火山引擎 2026-06/23 刊例）──
  // 注意：seed-2.1-pro / turbo 是旗舰直连首选，必须精确命中，否则 substring
  // 会回落到 Flash 价（out 4）造成约 7.5 倍低估。
  "doubao|doubao-seed-2-1-pro-260628": { input: 6, output: 30, cached: 1.2 },
  "doubao|doubao-seed-2-1-turbo-260628": { input: 3, output: 15, cached: 0.6 },

  // ── OpenRouter（公开目录价，人民币近似，含网关加价）──
  "openrouter|moonshotai/kimi-k2.6": { input: 14, output: 56 },
  "openrouter|qwen/qwen3.7-plus": { input: 5, output: 15 },
  "openrouter|bytedance-seed/seed-1.6-flash": { input: 1, output: 4 },
  "openrouter|z-ai/glm-5.2": { input: 2, output: 8, cached: 0.2 },

  // ── 离火 lihuo GPT-5.5（中转价未公开，暂用 OpenAI 官方价作上限估计）──
  // TODO: 用户确认离火实际中转单价后替换
  "lihuo|gpt-5.5": { input: 36, output: 216, cached: 3.6 },

  // ── GLM 直连 ──
  "glm|glm-5.1": { input: 2, output: 8, cached: 0.2 },

  // ── 兜底中转 ──
  "jiekou|gpt-4o": { input: 18, output: 72 },
  "openai|gpt-4.1-mini": { input: 2.5, output: 10 },
}

/**
 * Resolve prices for a (provider, model) pair.
 * Strategy: exact key → model-substring match → conservative default.
 */
function resolvePrices(provider: string | undefined, model: string | undefined): ModelTokenPrices {
  if (provider && model) {
    const exact = EXACT_PRICES[`${provider}|${model}`]
    if (exact) return exact
  }
  if (model) {
    const lower = model.toLowerCase()
    // substring fallbacks by family
    if (lower.includes("kimi")) return EXACT_PRICES["openrouter|moonshotai/kimi-k2.6"]
    if (lower.includes("qwen")) return EXACT_PRICES["openrouter|qwen/qwen3.7-plus"]
    if (lower.includes("seed") || lower.includes("doubao")) {
      // 区分 Pro / Turbo / Flash，避免旗舰走 Flash 价（约 7.5 倍低估）。
      // 精确 key 已覆盖 doubao-seed-2-1-pro/turbo 直连；此处兜底其他含 seed 的模型。
      if (lower.includes("pro")) return EXACT_PRICES["doubao|doubao-seed-2-1-pro-260628"]
      if (lower.includes("turbo")) return EXACT_PRICES["doubao|doubao-seed-2-1-turbo-260628"]
      return EXACT_PRICES["openrouter|bytedance-seed/seed-1.6-flash"]
    }
    if (lower.includes("glm") || lower.includes("z-ai")) {
      return EXACT_PRICES["openrouter|z-ai/glm-5.2"]
    }
    if (lower.includes("deepseek")) return EXACT_PRICES["deepseek|deepseek-v4-pro"]
    if (lower.includes("gpt-5")) return EXACT_PRICES["lihuo|gpt-5.5"]
    if (lower.includes("gpt-4")) return EXACT_PRICES["jiekou|gpt-4o"]
  }
  // conservative default: assume a mid-tier model
  return { input: 5, output: 20 }
}

/**
 * Compute the RMB cost of a single LLM call given observed token usage.
 * Returns yuan (not fen). Undefined usage → undefined cost.
 */
export function computeCostCny(
  provider: string | undefined,
  model: string | undefined,
  usage: { inputTokens?: number; outputTokens?: number; cachedTokens?: number }
): number | undefined {
  const input = usage.inputTokens
  const output = usage.outputTokens
  if (input === undefined && output === undefined) return undefined

  const prices = resolvePrices(provider, model)
  const inputTokens = input ?? 0
  const outputTokens = output ?? 0
  const cachedTokens = usage.cachedTokens ?? 0
  // cached portion billed at the (much lower) cached rate; remainder at full input rate
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens)

  const cost =
    (nonCachedInput * prices.input) / 1_000_000 +
    (cachedTokens * (prices.cached ?? prices.input)) / 1_000_000 +
    (outputTokens * prices.output) / 1_000_000

  // round to 6 decimals to match the DECIMAL(10,6) column
  return Math.round(cost * 1_000_000) / 1_000_000
}
