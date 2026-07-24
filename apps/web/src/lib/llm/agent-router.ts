import { LLMClient } from "./client"
import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { LLMProvider, LLMProviderConfig, ModelCapability } from "./types"
import { COPY_STUDIO_ROUTE_KEYS, type CopyStudioModule } from "@/lib/copy-studio"

/**
 * 智能体模型路由策略
 *
 * 核心思路：关键创作优先质量，日常生产优先稳定低成本
 * - 深度文案 / 商业选题 → ZenMux Claude 优先，离火 GPT-5.6 兜底
 * - 内容生产 / 质检 → DeepSeek 直连优先，ZenMux / OpenRouter 兜底
 *
 * provider 名与 config.ts 一致：deepseek / zenmux / jiekou / openrouter / apimart / therouter / glm / lihuo / qianfan / openai
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

/** model-swap 评估画像：仅评估脚本通过环境变量设置，生产路径不得设置。 */
export type AimEvalModelSwapProfile = "strong" | "weak"

export const AIM_EVAL_MODEL_SWAP_ENV = "AIM_EVAL_MODEL_SWAP_PROFILE"

/**
 * @description 读取评估用的 model-swap 画像（未设置则不影响生产路由）
 */
export function readEvalModelSwapProfile(): AimEvalModelSwapProfile | null {
  const raw = process.env[AIM_EVAL_MODEL_SWAP_ENV]?.trim()
  if (raw === "strong" || raw === "weak") return raw
  return null
}

/**
 * @description 按 swap 画像过滤路由：strong 仅 advanced；weak 仅 basic/standard
 */
export function applyEvalModelSwapFilter(routes: AgentModelRoute[]): AgentModelRoute[] {
  const profile = readEvalModelSwapProfile()
  if (!profile) return routes
  if (profile === "strong") {
    return routes.filter((route) => route.capability === "advanced")
  }
  return routes.filter((route) => route.capability === "basic" || route.capability === "standard")
}

const CAPABILITY_RANK: Record<ModelCapability, number> = {
  basic: 1,
  standard: 2,
  advanced: 3,
}

const AGENT_ROUTES: Record<string, AgentModelRoute[]> = {
  // ── 高质量写作 / 选题策划组 ──
  deep_copywriter: [
    // 旗舰链：Claude → GPT-5.6 → ERNIE 5.1（深度长文走非流式调用，放宽到 120s）
    { name: "zenmux", model: "anthropic/claude-sonnet-4.6", timeoutMs: 120000, capability: "advanced" },
    { name: "lihuo", model: "gpt-5.6", timeoutMs: 120000, capability: "advanced" },
    { name: "qianfan", model: "ernie-5.1", timeoutMs: 90000, capability: "advanced" },
    { name: "apimart", timeoutMs: 120000, capability: "advanced" },
    { name: "deepseek", capability: "standard" },
    { name: "glm", capability: "standard" },
  ],
  business_diagnosis: [
    // APIMart is the verified healthy advanced route; long diagnosis needs more than the generic 20s fallback budget.
    { name: "apimart", timeoutMs: 60000, capability: "advanced" },
    { name: "zenmux", model: "anthropic/claude-sonnet-4.6", timeoutMs: 20000, capability: "advanced" },
    { name: "openrouter", model: "deepseek/deepseek-v4-pro", timeoutMs: 20000, capability: "advanced" },
    { name: "openrouter", model: "z-ai/glm-5.2", timeoutMs: 20000, capability: "advanced" },
    { name: "lihuo", model: "gpt-5.6", timeoutMs: 20000, capability: "advanced" },
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
    // 自由创作首选文心一言：中文语感、本土表达、创意生成最强，国内端点低延迟
    { name: "qianfan", model: "ernie-5.1", capability: "advanced" },
    { name: "deepseek", capability: "standard" },
    { name: "glm", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "jiekou", capability: "basic" },
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
    { name: "apimart", model: "gpt-5.6", capability: "advanced" },
    { name: "zenmux", model: "anthropic/claude-sonnet-4.6", capability: "advanced" },
  ],

  // ── 朋友圈文案：口语化 + 钩子感 + 中文语感优先 ──
  moments_copywriter: [
    { name: "qianfan", model: "ernie-5.1", timeoutMs: 60000, capability: "advanced" },
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "glm", capability: "standard" },
    { name: "jiekou", capability: "basic" },
  ],
}

// 统一创作台模块复用现有生产链，避免在合并阶段改变主线的生产首选顺序。
const COPY_STUDIO_ROUTE_ALIASES: Record<string, string> = {
  [COPY_STUDIO_ROUTE_KEYS.social]: "content_producer",
  [COPY_STUDIO_ROUTE_KEYS.longform]: "deep_copywriter",
  [COPY_STUDIO_ROUTE_KEYS.free]: "free_copywriter",
  [COPY_STUDIO_ROUTE_KEYS.moments]: "moments_copywriter",
}

/**
 * @description 解析agentroutekey
 * @param agentId - 智能体 ID
 * @param module? - module?
 * @returns string
 */
export function resolveAgentRouteKey(agentId: string, module?: CopyStudioModule): string {
  if (module) return COPY_STUDIO_ROUTE_KEYS[module]
  return agentId
}

/**
 * 根据智能体 ID 获取专用的 LLM 实例
 * 按路由配置构造 provider 链，每个 provider 用指定的模型
 */
/**
 * @description 获取agentllm
 * @param agentId - 智能体 ID
 * @param policy? - policy?
 * @returns LLMClient
 */
export function getAgentLLM(agentId: string, policy?: AgentRoutingPolicy): LLMClient {
  const routes = AGENT_ROUTES[COPY_STUDIO_ROUTE_ALIASES[agentId] ?? agentId]

  if (!routes) {
    // 没有特殊配置，使用默认实例（provider 链按 config 顺序）
    return LLMClient.shared()
  }

  const allConfigs = getProviderConfigs()
  const configMap = new Map(allConfigs.map((c) => [c.name, c]))

  const providers: LLMProvider[] = []
  const swapFiltered = applyEvalModelSwapFilter(routes)
  const eligibleRoutes = policy
    ? swapFiltered.filter((route) =>
        CAPABILITY_RANK[route.capability] >= CAPABILITY_RANK[policy.minimumCapability]
      )
    : swapFiltered

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
/**
 * @description 获取agentrecommendedmodel
 * @param agentId - 智能体 ID
 * @returns string
 */
export function getAgentRecommendedModel(agentId: string): string {
  const routes = AGENT_ROUTES[COPY_STUDIO_ROUTE_ALIASES[agentId] ?? agentId]
  if (!routes) return "default"

  const allConfigs = getProviderConfigs()
  const firstAvailable = routes.find((r) => allConfigs.some((c) => c.name === r.name))
  if (!firstAvailable) return "default"

  const config = allConfigs.find((c) => c.name === firstAvailable.name)
  return firstAvailable.model || config?.defaultModel || "default"
}
