import { env } from "@/env"
import type { LLMProviderConfig } from "./types"

/**
 * 解析 LLM 出站代理：去掉引号/空白；无效值视为未配置。
 */
export function resolveLlmProxyUrl(
  ...candidates: Array<string | undefined | null>
): string | undefined {
  for (const raw of candidates) {
    if (raw == null) continue
    const trimmed = raw.trim().replace(/^["']|["']$/g, "")
    if (!trimmed) continue
    if (!/^https?:\/\//i.test(trimmed)) {
      console.error(`[llm] ignore invalid proxy URL (must be http/https): ${trimmed.slice(0, 64)}`)
      continue
    }
    return trimmed
  }
  return undefined
}

/**
 * ZenMux：生产默认禁止无代理直连（ECS → zenmux.ai 会挂死超时）。
 * 设 ZENMUX_ALLOW_DIRECT=true 才允许裸连（仅排障）。
 */
export function shouldRegisterZenMux(input: {
  apiKey?: string
  proxyURL?: string
  nodeEnv?: string
  allowDirect?: string
}): { ok: boolean; reason?: string } {
  if (!input.apiKey?.trim()) return { ok: false, reason: "missing_api_key" }
  const allowDirect = input.allowDirect?.trim().toLowerCase() === "true"
  const isProd = (input.nodeEnv || process.env.NODE_ENV) === "production"
  if (isProd && !allowDirect && !input.proxyURL) {
    return {
      ok: false,
      reason: "production_requires_proxy",
    }
  }
  return { ok: true }
}

/**
 * @description 获取providerconfigs
 * @returns LLMProviderConfig[]
 */
export function getProviderConfigs(): LLMProviderConfig[] {
  const configs: LLMProviderConfig[] = []

  // Primary: DeepSeek — OpenAI-compatible API
  if (env.DEEPSEEK_API_KEY) {
    configs.push({
      name: "deepseek",
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      defaultModel: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      ownModelPrefixes: ["deepseek"],
    })
  }

  // High-quality gateway: ZenMux — OpenAI-compatible unified model API
  // ECS 直连 zenmux.ai 常超时；生产必须 ZENMUX_PROXY_URL 或复用 APIMART_PROXY_URL。
  if (process.env.ZENMUX_API_KEY) {
    const proxyURL = resolveLlmProxyUrl(
      process.env.ZENMUX_PROXY_URL,
      env.APIMART_PROXY_URL,
    )
    const gate = shouldRegisterZenMux({
      apiKey: process.env.ZENMUX_API_KEY,
      proxyURL,
      nodeEnv: process.env.NODE_ENV,
      allowDirect: process.env.ZENMUX_ALLOW_DIRECT,
    })
    if (!gate.ok) {
      console.error(
        `[llm] ZenMux skipped (${gate.reason}): set ZENMUX_PROXY_URL or APIMART_PROXY_URL ` +
          "(ECS cannot reach zenmux.ai directly). Falling back to other providers.",
      )
    } else {
      if (!proxyURL) {
        console.warn("[llm] ZenMux registered without proxy (ZENMUX_ALLOW_DIRECT=true)")
      }
      configs.push({
        name: "zenmux",
        apiKey: process.env.ZENMUX_API_KEY,
        baseURL: process.env.ZENMUX_BASE_URL || "https://zenmux.ai/api/v1",
        defaultModel: process.env.ZENMUX_MODEL || "qwen/qwen3-max",
        isGateway: true,
        proxyURL,
      })
    }
  }

  // Alternative: JieKou AI — OpenAI-compatible API（接口AI中转站）
  if (env.JIEKOU_API_KEY) {
    configs.push({
      name: "jiekou",
      apiKey: env.JIEKOU_API_KEY,
      baseURL: env.JIEKOU_BASE_URL || "https://api.highwayapi.ai/openai",
      defaultModel: env.JIEKOU_MODEL || "gpt-4o",
      isGateway: true, // 接口AI 中转站
    })
  }

  // Backup: OpenRouter — unified LLM gateway（多模型聚合）
  if (env.OPENROUTER_API_KEY) {
    configs.push({
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultModel: env.OPENROUTER_MODEL || "qwen/qwen3.7-plus",
      isGateway: true,
    })
  }

  // Backup: APIMart — OpenAI-compatible relay, used after primary gateways.
  if (env.APIMART_API_KEY) {
    configs.push({
      name: "apimart",
      apiKey: env.APIMART_API_KEY,
      baseURL: env.APIMART_BASE_URL || "https://api.apimart.ai/v1",
      defaultModel: env.APIMART_MODEL || "gpt-5",
      isGateway: true,
      proxyURL: resolveLlmProxyUrl(env.APIMART_PROXY_URL),
    })
  }

  // Fallback: TheRouter — unified LLM gateway
  if (env.THEROUTER_API_KEY) {
    configs.push({
      name: "therouter",
      apiKey: env.THEROUTER_API_KEY,
      baseURL: env.THEROUTER_BASE_URL || "https://api.therouter.ai/v1",
      defaultModel: env.THEROUTER_MODEL || "anthropic/claude-sonnet-4.5",
      isGateway: true,
    })
  }

  // Direct: Z.AI / GLM — OpenAI-compatible API
  const glmApiKey = env.GLM_API_KEY || env.ZAI_API_KEY
  if (glmApiKey) {
    configs.push({
      name: "glm",
      apiKey: glmApiKey,
      baseURL: env.GLM_BASE_URL || env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4/",
      defaultModel: env.GLM_MODEL || env.ZAI_MODEL || "glm-5.1",
      ownModelPrefixes: ["glm", "zai"],
    })
  }

  // GPT-5.x: 离火API中转站（OpenAI-compatible，GPT-5.4/5.5 等模型）
  if (env.LIHUO_API_KEY) {
    configs.push({
      name: "lihuo",
      apiKey: env.LIHUO_API_KEY,
      baseURL: env.LIHUO_BASE_URL || "https://api.lihuo.me/v1",
      defaultModel: env.LIHUO_MODEL || "gpt-5.6",
      isGateway: true, // 离火中转站
      defaultHeaders: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    })
  }

  // 文心一言（ERNIE）: 百度千帆国内端点 — OpenAI-compatible API
  // 中文语感、本土表达、国内平台适配最强；自由创作首选
  if (env.QIANFAN_API_KEY) {
    configs.push({
      name: "qianfan",
      apiKey: env.QIANFAN_API_KEY,
      baseURL: env.QIANFAN_BASE_URL || "https://qianfan.baidubce.com/v2",
      defaultModel: env.QIANFAN_MODEL || "ernie-5.1",
      ownModelPrefixes: ["ernie", "baidu"],
    })
  }

  // Fallback: Native OpenAI
  if (env.OPENAI_API_KEY) {
    configs.push({
      name: "openai",
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      defaultModel: env.OPENAI_MODEL || "gpt-4.1-mini",
      ownModelPrefixes: ["gpt-", "o1", "o3", "o4"],
    })
  }

  return configs
}

/** 真实模型评估（daily / full / model-swap）所需：至少一个已配置 Provider。 */
export function listConfiguredProviderNames(): string[] {
  return getProviderConfigs().map((config) => config.name)
}

/**
 * @description 断言已配置真实模型密钥；缺失时抛错（评估门禁不得静默跳过）
 * @param purpose - 用途说明（写入错误信息）
 */
export function assertRealModelProvidersConfigured(purpose: string): void {
  const names = listConfiguredProviderNames()
  if (names.length === 0) {
    throw new Error(
      `[aim-eval] ${purpose} 需要至少一个 LLM Provider 密钥（如 DEEPSEEK_API_KEY / APIMART_API_KEY / THEROUTER_API_KEY），` +
        "当前未配置。禁止静默跳过真实模型评估。",
    )
  }
}
