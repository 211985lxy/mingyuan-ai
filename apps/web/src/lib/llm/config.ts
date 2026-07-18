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

  // Direct: 火山引擎豆包 — OpenAI-compatible API
  if (process.env.DOUBAO_API_KEY) {
    configs.push({
      name: "doubao",
      apiKey: process.env.DOUBAO_API_KEY,
      baseURL: process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      defaultModel: process.env.DOUBAO_MODEL || "doubao-seed-2-1-pro-260628",
    })
  }

  // Direct: 阿里云百炼 DashScope — OpenAI-compatible 模式
  if (process.env.DASHSCOPE_API_KEY) {
    configs.push({
      name: "dashscope",
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModel: process.env.DASHSCOPE_MODEL || "qwen-plus",
    })
  }

  // Direct: MiniMax — OpenAI-compatible API
  if (process.env.MINIMAX_API_KEY) {
    configs.push({
      name: "minimax",
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1",
      defaultModel: process.env.MINIMAX_MODEL || "abab6.5s-chat",
    })
  }

  // Direct: 百度千帆 — OpenAI-compatible API（/v2/chat/completions，Bearer API Key 鉴权）
  // ERNIE 5.1：2026-07 评估报告国产第一（87.57），中文深度写作/公众号长文/润色均衡型旗舰
  if (process.env.QIANFAN_API_KEY) {
    configs.push({
      name: "qianfan",
      apiKey: process.env.QIANFAN_API_KEY,
      baseURL: process.env.QIANFAN_BASE_URL || "https://qianfan.baidubce.com/v2",
      defaultModel: process.env.QIANFAN_MODEL || "ernie-5.1",
    })
  }

  // ZenMux 聚合站（OpenAI-compatible，Claude/Gemini/GPT 海外旗舰已实测可调）
  if (process.env.ZENMUX_API_KEY) {
    configs.push({
      name: "zenmux",
      apiKey: process.env.ZENMUX_API_KEY,
      baseURL: process.env.ZENMUX_BASE_URL || "https://zenmux.ai/api/v1",
      defaultModel: process.env.ZENMUX_MODEL || "anthropic/claude-opus-4.8",
    })
  }

  // APIMart 聚合站（OpenAI-compatible，Claude/Gemini 备用通道；注意：需国际网络/代理才可达，
  // 国内直连会 SSL 失败，不可达时由故障转移链自动跳过，仅作末位备用）
  if (process.env.APIMART_API_KEY) {
    configs.push({
      name: "apimart",
      apiKey: process.env.APIMART_API_KEY,
      baseURL: process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1",
      defaultModel: process.env.APIMART_MODEL || "claude-opus-4-8",
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
