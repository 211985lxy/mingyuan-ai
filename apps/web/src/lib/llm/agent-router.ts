import { LLMClient } from "./client"
import { getProviderConfigs } from "./config"
import { OpenAICompatibleProvider } from "./provider"
import type { LLMProvider, LLMProviderConfig, ModelCapability } from "./types"
import { COPY_STUDIO_ROUTE_KEYS, type CopyStudioModule } from "@/lib/copy-studio"
import {
  AIM_FAST_SPOKEN_ROUTE_KEY,
} from "@/lib/aim-harness/fast-spoken-policy"

/**
 * 智能体模型路由策略
 *
 * 核心思路：关键创作优先质量，日常生产优先稳定低成本
 * - 作品编辑 → ZenMux Claude Sonnet 优先，离火 GPT-5.6 兜底
 * - 内容创作（content_producer）→ ZenMux Claude Opus 4.6（经代理）优先，DeepSeek / APIMart 兜底
 * - 商业诊断（business_system_diagnosis）→ ZenMux Claude Opus 4.6 优先，DeepSeek / APIMart 兜底
 * - 发布质检等 → DeepSeek 直连优先，ZenMux / OpenRouter 兜底
 *
 * provider 名与 config.ts 一致：deepseek / zenmux / jiekou / openrouter / apimart / therouter / glm / lihuo / qianfan / openai
 * model 为可选，覆盖 provider 的默认模型（同一 provider 下不同智能体可用不同模型）
 */

type AgentModelRoute = {
  name: string
  model?: string
  timeoutMs?: number
  maxRetries?: number
  capability: ModelCapability
}

type AgentRoutingPolicy = {
  minimumCapability: ModelCapability
  maxProviderAttempts: number
}

function freezeAgentRoutes(
  routes: Record<string, AgentModelRoute[]>
): Readonly<Record<string, readonly Readonly<AgentModelRoute>[]>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(routes).map(([agentId, agentRoutes]) => [
        agentId,
        Object.freeze(agentRoutes.map((route) => Object.freeze({ ...route }))),
      ])
    )
  )
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
export function applyEvalModelSwapFilter(routes: readonly AgentModelRoute[]): AgentModelRoute[] {
  const profile = readEvalModelSwapProfile()
  if (!profile) return [...routes]
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

const QUALITY_PRIMARY_ROUTE: AgentModelRoute[] = [
  {
    name: "zenmux",
    model: "anthropic/claude-sonnet-4.6",
    timeoutMs: 50_000,
    maxRetries: 0,
    capability: "advanced",
  },
  { name: "glm", model: "glm-5.1", timeoutMs: 30_000, capability: "standard" },
  { name: "apimart", model: "gpt-5.4", timeoutMs: 25_000, capability: "advanced" },
  { name: "deepseek", model: "deepseek-v4-pro", timeoutMs: 20_000, capability: "advanced" },
]

export const AGENT_ROUTES = freezeAgentRoutes({
  [AIM_FAST_SPOKEN_ROUTE_KEY]: [...QUALITY_PRIMARY_ROUTE],
  // ── 高质量写作 / 选题策划组 ──
  work_editor: [
    // 先快失败再换路：ZenMux/离火近年常超时或 503，超时预算要短于前端流式总超时
    { name: "zenmux", model: "anthropic/claude-sonnet-4.6", timeoutMs: 25000, capability: "advanced" },
    { name: "apimart", timeoutMs: 45000, capability: "advanced" },
    { name: "deepseek", timeoutMs: 30000, capability: "standard" },
    { name: "qianfan", model: "ernie-5.1", timeoutMs: 45000, capability: "advanced" },
    { name: "lihuo", model: "gpt-5.6", timeoutMs: 20000, capability: "advanced" },
    { name: "glm", timeoutMs: 30000, capability: "standard" },
  ],
  business_diagnosis: [...QUALITY_PRIMARY_ROUTE],

  // ── 内容创作：Claude 质量优先，GLM / APIMart gpt-5.4 独立备用，DeepSeek 仅应急 ──
  content_producer: [...QUALITY_PRIMARY_ROUTE],

  // ── DeepSeek 组（质检 / 人设等日常分发，走官方直连）──
  free_copywriter: [
    // 自由创作首选文心一言：中文语感、本土表达、创意生成最强，国内端点低延迟
    { name: "qianfan", model: "ernie-5.1", capability: "advanced" },
    { name: "deepseek", capability: "standard" },
    { name: "glm", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "jiekou", capability: "basic" },
  ],
  business_system_diagnosis: [...QUALITY_PRIMARY_ROUTE],
  content_review: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "deepseek/deepseek-v4-flash", capability: "basic" },
    { name: "openrouter", model: "bytedance-seed/seed-1.6-flash", capability: "basic" },
    { name: "jiekou", capability: "basic" },
    { name: "glm", capability: "standard" },
  ],
  content_retro: [
    { name: "deepseek", capability: "standard" },
    { name: "apimart", capability: "advanced" },
    { name: "zenmux", capability: "standard" },
    { name: "openrouter", model: "deepseek/deepseek-v4-flash", capability: "basic" },
    { name: "openrouter", model: "bytedance-seed/seed-1.6-flash", capability: "basic" },
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
})

/** 路由表里出现过的 provider + 可选 model（供体检脚本去重探测）。 */
export type RoutedModelTarget = {
  provider: string
  model?: string
}

/**
 * @description 列出智能体路由表中的全部 provider/model 组合（去重）
 */
export function listRoutedModelTargets(): RoutedModelTarget[] {
  const seen = new Set<string>()
  const out: RoutedModelTarget[] = []
  for (const routes of Object.values(AGENT_ROUTES)) {
    for (const route of routes) {
      const key = `${route.name}::${route.model ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        provider: route.name,
        ...(route.model ? { model: route.model } : {}),
      })
    }
  }
  return out
}

// 统一创作台模块复用现有生产链，避免在合并阶段改变主线的生产首选顺序。
const COPY_STUDIO_ROUTE_ALIASES: Record<string, string> = {
  [COPY_STUDIO_ROUTE_KEYS.social]: "content_producer",
  // 深度长文已并入内容创作；作品编辑只做二改/排版，不吃 longform 路由
  [COPY_STUDIO_ROUTE_KEYS.longform]: "content_producer",
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
      ...(route.maxRetries !== undefined ? { maxRetries: route.maxRetries } : {}),
      capability: route.capability,
    }
    const provider = new OpenAICompatibleProvider(mergedConfig)
    if (!provider.isAvailable()) continue
    providers.push(provider)
  }

  if (providers.length === 0) {
    if (!policy) {
      console.warn(`[agent-router] No providers available for agent "${agentId}", using default`)
      return LLMClient.shared()
    }
    console.warn(
      `[agent-router] No routed providers available for "${agentId}"; falling back to the configured provider chain`,
    )
    // 路由模型未配置/不兼容时仍要尝试已配置的可用供应商；否则会在真正
    // 发出任何模型请求前直接得到 “No AI providers configured”，表现为“模型没调用”。
    const fallbackProviders = allConfigs
      .map((config) => new OpenAICompatibleProvider(config))
      .filter((provider) => provider.isAvailable())
    return new LLMClient(fallbackProviders, {
      maxAttempts: policy.maxProviderAttempts,
      circuitScope: COPY_STUDIO_ROUTE_ALIASES[agentId] ?? agentId,
    })
  }

  return new LLMClient(providers, {
    maxAttempts: policy?.maxProviderAttempts,
    circuitScope: COPY_STUDIO_ROUTE_ALIASES[agentId] ?? agentId,
  })
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
