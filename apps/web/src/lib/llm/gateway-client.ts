import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import { LLMClient } from "./client"
import type { LLMProvider } from "./types"

/** 认识跨网关模型名（anthropic/…、openai/…）的聚合网关，按可用性经验排序 */
const GATEWAY_ORDER = ["zenmux", "apimart", "openrouter"]

/**
 * 跨网关模型专用链：LLMClient.shared() 的直连供应商（deepseek 等）不认识
 * anthropic/claude-sonnet-4.6 这类模型名，会直接 400 且不重试；显式指定
 * 跨网关模型的调用（文案生成/转写校对）必须走这里，只挂聚合网关。
 */
export function createGatewayLLM(): LLMClient {
  const byName = new Map(getProviderConfigs().map((c) => [c.name, c]))
  const providers: LLMProvider[] = GATEWAY_ORDER
    .map((name) => byName.get(name))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => new OpenAICompatibleProvider(c))
    .filter((p) => p.isAvailable())
  return new LLMClient(providers)
}
