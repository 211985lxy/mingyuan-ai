import { env } from "@/env"
import type { LLMProviderConfig } from "./types"

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
      defaultModel: env.LIHUO_MODEL || "gpt-5.5",
      defaultHeaders: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
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
