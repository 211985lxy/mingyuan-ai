import { env } from "@/env"
import type { LLMProviderConfig } from "./types"

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
      defaultModel: env.DEEPSEEK_MODEL || "deepseek-chat",
    })
  }

  // High-quality gateway: ZenMux — OpenAI-compatible unified model API
  if (process.env.ZENMUX_API_KEY) {
    configs.push({
      name: "zenmux",
      apiKey: process.env.ZENMUX_API_KEY,
      baseURL: process.env.ZENMUX_BASE_URL || "https://zenmux.ai/api/v1",
      defaultModel: process.env.ZENMUX_MODEL || "qwen/qwen3-max",
    })
  }

  // Alternative: JieKou AI — OpenAI-compatible API（接口AI中转站）
  if (env.JIEKOU_API_KEY) {
    configs.push({
      name: "jiekou",
      apiKey: env.JIEKOU_API_KEY,
      baseURL: env.JIEKOU_BASE_URL || "https://api.highwayapi.ai/openai",
      defaultModel: env.JIEKOU_MODEL || "gpt-4o",
    })
  }

  // Backup: OpenRouter — unified LLM gateway（多模型聚合）
  if (env.OPENROUTER_API_KEY) {
    configs.push({
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultModel: env.OPENROUTER_MODEL || "qwen/qwen3.7-plus",
    })
  }

  // Backup: APIMart — OpenAI-compatible relay, used after primary gateways.
  if (env.APIMART_API_KEY) {
    configs.push({
      name: "apimart",
      apiKey: env.APIMART_API_KEY,
      baseURL: env.APIMART_BASE_URL || "https://api.apimart.ai/v1",
      defaultModel: env.APIMART_MODEL || "gpt-5",
      proxyURL: env.APIMART_PROXY_URL,
    })
  }

  // Fallback: TheRouter — unified LLM gateway
  if (env.THEROUTER_API_KEY) {
    configs.push({
      name: "therouter",
      apiKey: env.THEROUTER_API_KEY,
      baseURL: env.THEROUTER_BASE_URL || "https://api.therouter.ai/v1",
      defaultModel: env.THEROUTER_MODEL || "anthropic/claude-sonnet-4.5",
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
    })
  }

  // GPT-5.x: 离火API中转站（OpenAI-compatible，GPT-5.4/5.5 等模型）
  if (env.LIHUO_API_KEY) {
    configs.push({
      name: "lihuo",
      apiKey: env.LIHUO_API_KEY,
      baseURL: env.LIHUO_BASE_URL || "https://api.lihuo.me/v1",
      defaultModel: env.LIHUO_MODEL || "gpt-5.6",
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
    })
  }

  // Fallback: Native OpenAI
  if (env.OPENAI_API_KEY) {
    configs.push({
      name: "openai",
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      defaultModel: env.OPENAI_MODEL || "gpt-4.1-mini",
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
