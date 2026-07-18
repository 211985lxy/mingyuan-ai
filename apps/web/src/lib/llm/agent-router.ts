import { LLMClient } from "./client"
import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { LLMProvider, LLMProviderConfig, ModelCapability } from "./types"

/**
 * 智能体模型路由策略
 *
 * 核心思路：关键创作优先质量，日常生产优先稳定低成本
 * - 深度文案 / 商业选题 → ZenMux Claude 优先，离火 GPT-5.5 兜底
 * - 内容生产 / 质检 → DeepSeek 直连优先，ZenMux / OpenRouter 兜底
 *
 * provider 名与 config.ts 一致：deepseek / zenmux / jiekou / openrouter / apimart / therouter / glm / lihuo / openai
 * model 为可选，覆盖 provider 的默认模型（同一 provider 下不同智能体可用不同模型）
 */

type AgentModelRoute = {
  name: string
  model?: string
  timeoutMs?: number
  capability: ModelCapability
}

type AgentRoutingPolicy = {
  minimumCapability: ModelCapability
  maxProviderAttempts: number
}

const CAPABILITY_RANK: Record<ModelCapability, number> = {
  basic: 1,
  standard: 2,
  advanced: 3,
}

const AGENT_ROUTES: Record<string, AgentModelRoute[]> = {
  // ── 高质量写作 / 选题策划组 ──
  deep_copywriter: [
    // 深度长文走非流式调用，Claude/gpt-5 整篇生成常超过通用 60s 超时，放宽到 120s。
    { name: "zenmux", model: "anthropic/claude-sonnet-4.6", timeoutMs: 120000, capability: "advanced" },
    { name: "apimart", timeoutMs: 120000, capability: "advanced" },
    { name: "lihuo", model: "gpt-5.5", capability: "advanced" },
    { name: "deepseek", capability: "standard" },
    { name: "openrouter", model: "qwen/qwen3.7-plus", capability: "standard" },
    { name: "openrouter", model: "moonshotai/kimi-k2.6", capability: "standard" },
    { name: "jiekou", capability: "basic" },
    { name: "therouter", capability: "standard" },
    { name: "glm", capability: "standard" },
  ],
  business_diagnosis: [
    // APIMart is the verified healthy advanced route; long diagnosis needs more than the generic 20s fallback budget.
    { name: "apimart", timeoutMs: 60000, capability: "advanced" },
    { name: "zenmux", model: "anthropic/claude-sonnet-4.6", timeoutMs: 20000, capability: "advanced" },
    { name: "openrouter", model: "deepseek/deepseek-v4-pro", timeoutMs: 20000, capability: "advanced" },
    { name: "openrouter", model: "z-ai/glm-5.2", timeoutMs: 20000, capability: "advanced" },
    { name: "lihuo", model: "gpt-5.5", timeoutMs: 20000, capability: "advanced" },
    { name: "deepseek", timeoutMs: 20000, capability: "standard" },
    { name: "jiekou", timeoutMs: 20000, capability: "basic" },
    { name: "therouter", timeoutMs: 20000, capability: "standard" },
    { name: "glm", timeoutMs: 20000, capability: "standard" },
  ],

  // ── DeepSeek 组（日常分发，走官方直连，无中转差价）──
  // DeepSeek 官方直连价格最低，不走中转站加价；直连不可用时才回退到中转站
  content_producer: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "qwen/qwen3.7-plus", capability: "standard" },
    { name: "jiekou", capability: "basic" },
    { name: "glm", capability: "standard" },
  ],
  free_copywriter: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "qwen/qwen3.7-plus", capability: "standard" },
    { name: "jiekou", capability: "basic" },
    { name: "glm", capability: "standard" },
  ],
  business_system_diagnosis: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "deepseek/deepseek-v4-pro", capability: "advanced" },
    { name: "openrouter", model: "z-ai/glm-5.2", capability: "advanced" },
    { name: "jiekou", capability: "basic" },
    { name: "glm", capability: "standard" },
  ],
  content_review: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "deepseek/deepseek-v4-flash", capability: "basic" },
    { name: "openrouter", model: "bytedance-seed/seed-1.6-flash", capability: "basic" },
    { name: "jiekou", capability: "basic" },
    { name: "glm", capability: "standard" },
  ],
  persona: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "moonshotai/kimi-k2.6", capability: "standard" },
    { name: "openrouter", model: "qwen/qwen3.7-plus", capability: "standard" },
    { name: "jiekou", capability: "basic" },
    { name: "glm", capability: "standard" },
  ],
  vision_analysis: [
    { name: "openrouter", model: "qwen/qwen3-vl-8b-instruct", capability: "standard" },
    { name: "openrouter", model: "qwen/qwen3-vl-235b-a22b-instruct", capability: "advanced" },
  ],
}

/**
 * 根据智能体 ID 获取专用的 LLM 实例
 * 按路由配置构造 provider 链，每个 provider 用指定的模型
 */
export function getAgentLLM(agentId: string, policy?: AgentRoutingPolicy): LLMClient {
  const routes = AGENT_ROUTES[agentId]

  if (!routes) {
    // 没有特殊配置，使用默认实例（provider 链按 config 顺序）
    return LLMClient.shared()
  }

  const allConfigs = getProviderConfigs()
  const configMap = new Map(allConfigs.map((c) => [c.name, c]))

  const providers: LLMProvider[] = []
  const eligibleRoutes = policy
    ? routes.filter((route) =>
        CAPABILITY_RANK[route.capability] >= CAPABILITY_RANK[policy.minimumCapability]
      )
    : routes

  for (const route of eligibleRoutes) {
    const config = configMap.get(route.name)
    if (!config) continue
    // 如果指定了 model，覆盖 provider 的默认模型
    const mergedConfig: LLMProviderConfig = {
      ...config,
      ...(route.model ? { defaultModel: route.model } : {}),
      ...(route.timeoutMs ? { timeoutMs: route.timeoutMs } : {}),
      capability: route.capability,
    }
    providers.push(new OpenAICompatibleProvider(mergedConfig))
  }

  if (providers.length === 0) {
    if (!policy) {
      console.warn(`[agent-router] No providers available for agent "${agentId}", using default`)
      return LLMClient.shared()
    }
    console.warn(
      `[agent-router] No providers satisfy ${agentId} minimum capability "${policy.minimumCapability}"`
    )
  }

  return new LLMClient(providers, { maxAttempts: policy?.maxProviderAttempts })
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
