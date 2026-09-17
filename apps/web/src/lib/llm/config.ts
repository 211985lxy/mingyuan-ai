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
      defaultModel: env.DEEPSEEK_MODEL || "deepseek-flash",
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

  // Google Gemini — OpenAI 兼容端点（/v1beta/openai）。
  // 注意：baseURL 末尾不能再拼 /v1，官方兼容路径本身已含 /v1beta/openai。
  // generativelanguage.googleapis.com 在境内 ECS 通常不可直连，默认复用 APIMART 代理。
  //
  // 2026-09-17 实测（经 127.0.0.1:10808 代理，直连 20s 超时）：
  //   POST /v1beta/openai/chat/completions + model=gemini-3.8-flash → 200。
  //   GET /v1beta/models 可列出全部 50 个模型，gemini-3.8-flash 为准确 ID。
  //   ⚠️ 思考型模型：reasoning token 计入 max_tokens。同一句问候 max_tokens=300 时
  //   烧掉约 291 个在思考上、只剩 9 个产正文并静默截断（finish_reason=length），
  //   max_tokens=2000 才完整。调用点务必留 ≳2k 余量；预算过窄的路径（如
  //   aim-harness/tool-loop.ts 的 800）会把这一跳变成反复截断的死跳。
  //   生成链的 4k–12k 预算（planner.ts）足够，无需额外处理。
  if (env.GEMINI_API_KEY) {
    const proxyURL = resolveLlmProxyUrl(env.GEMINI_PROXY_URL, env.APIMART_PROXY_URL)
    if (!proxyURL && process.env.NODE_ENV === "production") {
      console.warn(
        "[llm] Gemini registered without proxy: 生产环境通常无法直连 generativelanguage.googleapis.com，" +
          "请配置 GEMINI_PROXY_URL（或 APIMART_PROXY_URL）。",
      )
    }
    configs.push({
      name: "gemini",
      apiKey: env.GEMINI_API_KEY,
      baseURL: env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: env.GEMINI_MODEL || "gemini-3.8-flash",
      ownModelPrefixes: ["gemini"],
      proxyURL,
    })
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
  //
  // 2026-09-17 实测：直连可用，但 **Claude / Gemini 全系按出口 IP 地域封锁**
  // （anthropic/claude-opus-4.6 与 google/gemini-3.8-flash 均为 403
  // "This model is not available in your region."）。经代理（出口 US）后两者均 200。
  // moonshotai/kimi-k3、x-ai/grok-4.6 直连即通，无需代理。
  // 因此：要用 OpenRouter 跑 Claude/Gemini，必须配 OPENROUTER_PROXY_URL
  // （回落 APIMART_PROXY_URL）；只跑 Kimi/Grok 可以不配。
  if (env.OPENROUTER_API_KEY) {
    configs.push({
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      defaultModel: env.OPENROUTER_MODEL || "qwen/qwen3.7-plus",
      isGateway: true,
      proxyURL: resolveLlmProxyUrl(env.OPENROUTER_PROXY_URL, env.APIMART_PROXY_URL),
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

  // Direct: Z.AI / GLM — OpenAI-compatible API（质量链已改用 doubao，保留注册便于独立启用）
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

  // Moonshot / Kimi — OpenAI-compatible。国内端点，中文语感强，无需代理。
  if (env.MOONSHOT_API_KEY) {
    configs.push({
      name: "moonshot",
      apiKey: env.MOONSHOT_API_KEY,
      baseURL: env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1",
      defaultModel: env.MOONSHOT_MODEL || "kimi-k3",
      ownModelPrefixes: ["kimi", "moonshot"],
    })
  }

  // Doubao（火山方舟）— OpenAI-compatible；国内直连低延迟，质量链第二跳。
  // 模型需先在方舟控制台开通（激活后以 /models 与真实探测为准）。
  const doubaoApiKey = env.DOUBAO_API_KEY
  if (doubaoApiKey) {
    configs.push({
      name: "doubao",
      apiKey: doubaoApiKey,
      baseURL: env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      defaultModel: env.DOUBAO_MODEL || "doubao-seed-2-1-pro-260628",
      ownModelPrefixes: ["doubao"],
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

  // xAI Grok — OpenAI-compatible。境外端点，境内 ECS 需代理（默认复用 APIMART 代理）。
  // ⚠️ 模型名待核：2026-09-17 经 OpenRouter 目录（444 个模型）确认存在的是 x-ai/grok-4.6、
  // 4.5、4.3、4.20——**没有裸 grok-4**（原默认值会 400，已改）。但这是 OpenRouter 的命名，
  // xAI 原生端点可能是 grok-4-6 这种带横线的写法，请对着 docs.x.ai/docs/models 核一遍
  // 再用 XAI_MODEL 覆盖。跑不通就走 openrouter 那条跳。
  if (env.XAI_API_KEY) {
    configs.push({
      name: "xai",
      apiKey: env.XAI_API_KEY,
      baseURL: env.XAI_BASE_URL || "https://api.x.ai/v1",
      defaultModel: env.XAI_MODEL || "grok-4.6",
      ownModelPrefixes: ["grok"],
      proxyURL: resolveLlmProxyUrl(env.XAI_PROXY_URL, env.APIMART_PROXY_URL),
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

  // 通义千问（Qwen）— 阿里云百炼 OpenAI 兼容模式（/compatible-mode/v1）。国内端点，无需代理。
  //
  // 2026-09-17 实测（真实密钥，无代理直连）：
  //   ✅ baseURL https://dashscope.aliyuncs.com/compatible-mode/v1 + qwen3-max → 200 出文本。
  //   ⚠️ **API Key 按地域绑定**：同一把 key 打 dashscope.aliyuncs.com 为 200，
  //      打 dashscope-intl / dashscope-us 均 401 invalid_api_key。换地域要换 key。
  //   默认模型选 qwen3-max 是因为它**没有推理开销**（usage 实测 14 prompt + 28 completion
  //   = 42，零 reasoning_tokens），窄预算路径也安全；更新的 qwen3.8-max / qwen3.7-max
  //   是思考型（实测 reasoning_tokens 26 / 385），要用得按 Gemini 那样留 ≳2k 余量。
  if (env.DASHSCOPE_API_KEY) {
    configs.push({
      name: "dashscope",
      apiKey: env.DASHSCOPE_API_KEY,
      baseURL: env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModel: env.DASHSCOPE_MODEL || "qwen3-max",
      ownModelPrefixes: ["qwen", "qwq"],
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
