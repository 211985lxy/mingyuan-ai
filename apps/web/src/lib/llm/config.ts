import type { LLMProviderConfig } from "./types"

export function getProviderConfigs(): LLMProviderConfig[] {
  const configs: LLMProviderConfig[] = []

  // Primary: DeepSeek — OpenAI-compatible API
  if (process.env.DEEPSEEK_API_KEY) {
    configs.push({
      name: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      defaultModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    })
  }

  // Alternative: JieKou AI — OpenAI-compatible API（接口AI中转站）
  if (process.env.JIEKOU_API_KEY) {
    configs.push({
      name: "jiekou",
      apiKey: process.env.JIEKOU_API_KEY,
      baseURL: process.env.JIEKOU_BASE_URL || "https://api.highwayapi.ai/openai",
      defaultModel: process.env.JIEKOU_MODEL || "gpt-4o",
    })
  }

  // Backup: OpenRouter — unified LLM gateway（多模型聚合）
  if (process.env.OPENROUTER_API_KEY) {
    configs.push({
      name: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultModel: process.env.OPENROUTER_MODEL || "qwen/qwen3.7-plus",
    })
  }

  // Fallback: TheRouter — unified LLM gateway
  if (process.env.THEROUTER_API_KEY) {
    configs.push({
      name: "therouter",
      apiKey: process.env.THEROUTER_API_KEY,
      baseURL: process.env.THEROUTER_BASE_URL || "https://api.therouter.ai/v1",
      defaultModel: process.env.THEROUTER_MODEL || "anthropic/claude-sonnet-4.5",
    })
  }

  // Direct: Z.AI / GLM — OpenAI-compatible API
  const glmApiKey = process.env.GLM_API_KEY || process.env.ZAI_API_KEY
  if (glmApiKey) {
    configs.push({
      name: "glm",
      apiKey: glmApiKey,
      baseURL: process.env.GLM_BASE_URL || process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4/",
      defaultModel: process.env.GLM_MODEL || process.env.ZAI_MODEL || "glm-5.1",
    })
  }

  // GPT-5.x: 离火API中转站（OpenAI-compatible，GPT-5.4/5.5 等模型）
  if (process.env.LIHUO_API_KEY) {
    configs.push({
      name: "lihuo",
      apiKey: process.env.LIHUO_API_KEY,
      baseURL: process.env.LIHUO_BASE_URL || "https://api.lihuo.me/v1",
      defaultModel: process.env.LIHUO_MODEL || "gpt-5.5",
      defaultHeaders: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    })
  }

  // Fallback: Native OpenAI
  if (process.env.OPENAI_API_KEY) {
    configs.push({
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      defaultModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    })
  }

  return configs
}
