import { LLMClient } from "./client"
import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { LLMProvider, LLMProviderConfig } from "./types"

/**
 * 智能体模型路由策略
 *
 * 核心思路：关键创作优先质量，日常生产优先稳定低成本
 * - 深度文案 / 商业选题 → 离火 GPT-5.5 优先，OpenRouter 国产强模型兜底
 * - 内容生产 / 质检 → DeepSeek 直连优先，OpenRouter 国产快模型兜底
 *
 * provider 名与 config.ts 一致：deepseek / jiekou / openrouter / therouter / glm / lihuo / openai
 * model 为可选，覆盖 provider 的默认模型（同一 provider 下不同智能体可用不同模型）
 */

type AgentModelRoute = { name: string; model?: string; timeoutMs?: number }

const AGENT_ROUTES: Record<string, AgentModelRoute[]> = {
  // ── 高质量写作 / 选题策划组 ──
  deep_copywriter: [
    { name: "lihuo", model: "gpt-5.5" },
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "openrouter", model: "moonshotai/kimi-k2.6" },
    { name: "deepseek" },
    { name: "jiekou" },
    { name: "therouter" },
    { name: "glm" },
  ],
  business_diagnosis: [
    // ponytail: planning/diagnosis routes are non-streaming; keep each fallback short so the chain cannot eat the whole 180s client budget.
    { name: "lihuo", model: "gpt-5.5", timeoutMs: 20000 },
    { name: "openrouter", model: "deepseek/deepseek-v4-pro", timeoutMs: 20000 },
    { name: "openrouter", model: "z-ai/glm-5.2", timeoutMs: 20000 },
    { name: "deepseek", timeoutMs: 20000 },
    { name: "jiekou", timeoutMs: 20000 },
    { name: "therouter", timeoutMs: 20000 },
    { name: "glm", timeoutMs: 20000 },
  ],

  // ── DeepSeek 组（日常分发，走官方直连，无中转差价）──
  // DeepSeek 官方直连价格最低，不走中转站加价；直连不可用时才回退到中转站
  content_producer: [
    { name: "deepseek" },
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  free_copywriter: [
    { name: "deepseek" },
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  business_system_diagnosis: [
    { name: "deepseek" },
    { name: "openrouter", model: "deepseek/deepseek-v4-pro" },
    { name: "openrouter", model: "z-ai/glm-5.2" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  content_review: [
    { name: "deepseek" },
    { name: "openrouter", model: "deepseek/deepseek-v4-flash" },
    { name: "openrouter", model: "bytedance-seed/seed-1.6-flash" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  persona: [
    { name: "deepseek" },
    { name: "openrouter", model: "moonshotai/kimi-k2.6" },
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  vision_analysis: [
    { name: "openrouter", model: "qwen/qwen3-vl-8b-instruct" },
    { name: "openrouter", model: "qwen/qwen3-vl-235b-a22b-instruct" },
  ],
}

/**
 * 根据智能体 ID 获取专用的 LLM 实例
 * 按路由配置构造 provider 链，每个 provider 用指定的模型
 */
export function getAgentLLM(agentId: string): LLMClient {
  const routes = AGENT_ROUTES[agentId]

  if (!routes) {
    // 没有特殊配置，使用默认实例（provider 链按 config 顺序）
    return LLMClient.shared()
  }

  const allConfigs = getProviderConfigs()
  const configMap = new Map(allConfigs.map((c) => [c.name, c]))

  const providers: LLMProvider[] = []
  for (const route of routes) {
    const config = configMap.get(route.name)
    if (!config) continue
    // 如果指定了 model，覆盖 provider 的默认模型
    const mergedConfig: LLMProviderConfig = {
      ...config,
      ...(route.model ? { defaultModel: route.model } : {}),
      ...(route.timeoutMs ? { timeoutMs: route.timeoutMs } : {}),
    }
    providers.push(new OpenAICompatibleProvider(mergedConfig))
  }

  if (providers.length === 0) {
    console.warn(`[agent-router] No providers available for agent "${agentId}", using default`)
    return LLMClient.shared()
  }

  return new LLMClient(providers)
}

/**
 * 获取智能体的推荐模型名称（用于日志/可观测）
 */
export function getAgentRecommendedModel(agentId: string): string {
  const routes = AGENT_ROUTES[agentId]
  if (!routes) return "default"

  const allConfigs = getProviderConfigs()
  const firstAvailable = routes.find((r) => allConfigs.some((c) => c.name === r.name))
  if (!firstAvailable) return "default"

  const config = allConfigs.find((c) => c.name === firstAvailable.name)
  return firstAvailable.model || config?.defaultModel || "default"
}
