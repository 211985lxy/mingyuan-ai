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
 * provider 名与 config.ts 一致：deepseek / jiekou / openrouter / therouter / glm / lihuo / openai / doubao / dashscope / minimax / zenmux / qianfan（百度千帆）
 * model 为可选，覆盖 provider 的默认模型（同一 provider 下不同智能体可用不同模型）
 */

export type AgentModelRoute = { name: string; model?: string; timeoutMs?: number }

const AGENT_ROUTES: Record<string, AgentModelRoute[]> = {
  // ── 高质量写作 / 选题策划组 ──
  // 2026-07 起全面质量优先（参考《自媒体大模型评估报告-2026年7月》）：
  // 旗舰模型（GPT-5.5 / 豆包 seed-2.1-pro）优先，低成本档仅在免费/质检场景保底下探
  deep_copywriter: [
    { name: "lihuo", model: "gpt-5.5" },
    { name: "zenmux", model: "anthropic/claude-opus-4.8" }, // Claude 旗舰（ZenMux，已实测可调）：品牌叙事/深度长文终审级
    { name: "jiekou", model: "claude-opus-4-8" }, // Claude 旗舰第二通道（接口AI中转，已实测可调）
    { name: "apimart", model: "claude-opus-4-8" }, // Claude 旗舰第三备用（APIMart，需代理/国际网络，不可达自动跳过）
    { name: "qianfan", model: "ernie-5.1" }, // 国产旗舰直连：ERNIE 5.1（2026-07 评估国产第一 87.57，中文深度写作/公众号长文均衡型）
    { name: "dashscope", model: "qwen-plus" }, // 国产旗舰直连：通义千问（定位表「综合型中文创作」双主力之一，与 ERNIE 并排）
    { name: "doubao", model: "doubao-seed-2-1-pro-260628" }, // 旗舰直连兜底：中文创意写作第一梯队（SuperCLUE-Writing 86+）
    { name: "minimax", model: "abab6.5s-chat" }, // 新增直连：MiniMax 直连兜底
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
    { name: "zenmux", model: "anthropic/claude-opus-4.8", timeoutMs: 20000 }, // Claude 旗舰（ZenMux，已实测可调）
    { name: "jiekou", model: "claude-opus-4-8", timeoutMs: 20000 }, // Claude 旗舰第二通道（接口AI中转）
    { name: "apimart", model: "claude-opus-4-8", timeoutMs: 20000 }, // Claude 旗舰第三备用（APIMart，需代理，不可达自动跳过）
    { name: "openrouter", model: "deepseek/deepseek-v4-pro", timeoutMs: 20000 },
    { name: "openrouter", model: "z-ai/glm-5.2", timeoutMs: 20000 },
    { name: "doubao", model: "doubao-seed-2-1-pro-260628", timeoutMs: 20000 }, // 旗舰直连层：商业分析强模型
    { name: "deepseek", timeoutMs: 20000 },
    { name: "jiekou", timeoutMs: 20000 },
    { name: "therouter", timeoutMs: 20000 },
    { name: "glm", timeoutMs: 20000 },
  ],

  // ── 日常生产组（质量优先：豆包旗舰首选，DeepSeek 直连保稳定）──
  // 2026-07 模型评估报告：社媒/短视频/口播类内容豆包平台语感最强，content_producer 提为首选；
  // DeepSeek 口播稿偏报告化，降为第二主力（仍保稳定低成本直连）
  // 直连 provider 不可用（无 API key）时自动跳过，回退到中转站兜底层
  content_producer: [
    { name: "doubao", model: "doubao-seed-2-1-pro-260628" }, // 首选直连：豆包旗舰（社媒语感/钩子/口播，质量优先）
    { name: "doubao", model: "doubao-seed-2-1-turbo-260628" }, // 同厂商均衡档
    { name: "qianfan", model: "ernie-5.1" }, // 国产旗舰直连：综合型中文创作第一梯队（评估报告：ERNIE 综合中文创作强）
    { name: "deepseek" },
    { name: "dashscope", model: "qwen-plus" }, // 新增直连：阿里云百炼
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  free_copywriter: [
    { name: "deepseek" },
    { name: "qianfan", model: "ernie-4.5-turbo-32k" }, // 千帆低成本档：输入 0.0008 / 输出 0.0032 元每千 tokens，缓存命中更省
    { name: "doubao", model: "doubao-seed-2-1-turbo-260628" }, // 质量路线下免费档也保持 turbo 均衡档（不用 lite）
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  business_system_diagnosis: [
    // 天命全案是旗舰交付物（单次 33K-42K tokens），质量优先：GPT-5.5 首选，逐层 20s 超时防卡死
    { name: "lihuo", model: "gpt-5.5", timeoutMs: 20000 },
    { name: "zenmux", model: "anthropic/claude-opus-4.8", timeoutMs: 20000 }, // Claude 旗舰（ZenMux，已实测可调）
    { name: "jiekou", model: "claude-opus-4-8", timeoutMs: 20000 }, // Claude 旗舰第二通道（接口AI中转）
    { name: "apimart", model: "claude-opus-4-8", timeoutMs: 20000 }, // Claude 旗舰第三备用（APIMart，需代理，不可达自动跳过）
    { name: "qianfan", model: "ernie-5.1", timeoutMs: 20000 }, // 国产旗舰直连：ERNIE 5.1 长文一致性/正式中文表达强
    { name: "doubao", model: "doubao-seed-2-1-pro-260628", timeoutMs: 20000 }, // 旗舰直连层
    { name: "deepseek" },
    { name: "openrouter", model: "deepseek/deepseek-v4-pro" },
    { name: "openrouter", model: "z-ai/glm-5.2" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  content_review: [
    { name: "deepseek" }, // 与生成方（豆包系）交叉审核，保证独立性
    { name: "doubao", model: "doubao-seed-2-1-turbo-260628" }, // 质检升级为均衡档（质量路线不用 lite）
    { name: "openrouter", model: "deepseek/deepseek-v4-flash" },
    { name: "openrouter", model: "bytedance-seed/seed-1.6-flash" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  // ── 统一创作官（模块化路由：一个智能体，handler 按任务特征选模块键）──
  // 设计方案见工作区《明远AiM-统一创作官与作品编辑环节设计方案.md》
  // 旧键 content_producer / deep_copywriter / free_copywriter 保留作兼容层，handler 合并后切换到这里
  copywriter_social: [ // 社媒多平台速产（取代 content_producer）
    { name: "doubao", model: "doubao-seed-2-1-pro-260628" }, // 首选直连：豆包旗舰（社媒语感/钩子/口播，质量优先）
    { name: "doubao", model: "doubao-seed-2-1-turbo-260628" }, // 同厂商均衡档
    { name: "qianfan", model: "ernie-5.1" }, // 国产旗舰直连：综合型中文创作第一梯队
    { name: "deepseek" },
    { name: "dashscope", model: "qwen-plus" },
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  copywriter_longform: [ // 深度长文（取代 deep_copywriter）
    { name: "lihuo", model: "gpt-5.5" },
    { name: "zenmux", model: "anthropic/claude-opus-4.8" }, // Claude 旗舰（ZenMux）：品牌叙事/深度长文终审级
    { name: "jiekou", model: "claude-opus-4-8" }, // Claude 第二通道（接口AI）
    { name: "apimart", model: "claude-opus-4-8" }, // Claude 第三备用（APIMart，需代理/国际网络，不可达自动跳过）
    { name: "qianfan", model: "ernie-5.1" }, // ERNIE 中文长文成稿
    { name: "doubao", model: "doubao-seed-2-1-pro-260628" }, // 旗舰直连兜底
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "openrouter", model: "moonshotai/kimi-k2.6" },
    { name: "deepseek" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  copywriter_free: [ // 自由交付（取代 free_copywriter）
    { name: "deepseek" },
    { name: "qianfan", model: "ernie-4.5-turbo-32k" }, // 千帆低成本档
    { name: "doubao", model: "doubao-seed-2-1-turbo-260628" }, // 质量路线保持 turbo 均衡档
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  // ── 作品编辑环节（二次修改/润色/排版）──
  // 评估报告：中文稿件润色 ERNIE 首选，社媒语感豆包保持，高价值稿件 Claude 终审
  editor_text: [ // 图文/公众号编辑（/api/scripts/polish 三模式 + 编辑器面板）
    { name: "qianfan", model: "ernie-5.1" }, // ERNIE 中文成稿/润色强（报告：综合型中文创作首选）
    { name: "doubao", model: "doubao-seed-2-1-pro-260628" }, // 社媒语感/钩子保持
    { name: "zenmux", model: "anthropic/claude-opus-4.8" }, // 高价值稿件终审级润色
    { name: "jiekou", model: "claude-opus-4-8" }, // Claude 备用通道
    { name: "deepseek" },
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "glm" },
  ],
  persona: [
    { name: "deepseek" },
    { name: "openrouter", model: "moonshotai/kimi-k2.6" }, // 长上下文人设生成（报告：Kimi 长资料整理强项）
    { name: "dashscope", model: "qwen-plus" }, // 新增直连：阿里云百炼
    { name: "openrouter", model: "qwen/qwen3.7-plus" },
    { name: "jiekou" },
    { name: "glm" },
  ],
  vision_analysis: [
    { name: "openrouter", model: "qwen/qwen3-vl-235b-a22b-instruct" }, // 质量优先：大参数 VL 首选
    { name: "zenmux", model: "google/gemini-3.1-pro-preview" }, // Gemini 多模态研究强项（ZenMux，已实测可调）
    { name: "openrouter", model: "qwen/qwen3-vl-8b-instruct" },
    { name: "doubao", model: "doubao-seed-2-1-turbo-260628" }, // 新增直连兜底：支持图片/视频理解，OpenRouter 故障时接管
  ],
}

// ── 统一文案创作台 copy_studio：模块路由键 ─────────────────
// 深度文案与内容生产合并为 copy_studio，用模块键区分功能模块；旧 agentId 经
// LEGACY_AGENT_ALIAS 透明映射，现有调用点零改动。outline / polish 为新拆模块：
// polish 承接原 scripts/polish 的 editor_text（此前无专属路由、落默认链，借此正式化）。
AGENT_ROUTES["copy_studio.outline"] = [
  { name: "lihuo", model: "gpt-5.5", timeoutMs: 20000 },
  { name: "zenmux", model: "anthropic/claude-opus-4.8", timeoutMs: 20000 },
  { name: "qianfan", model: "ernie-5.1", timeoutMs: 20000 }, // 国产旗舰：长文框架/选题策划
  { name: "doubao", model: "doubao-seed-2-1-pro-260628", timeoutMs: 20000 },
  { name: "deepseek", timeoutMs: 20000 },
  { name: "jiekou", timeoutMs: 20000 },
  { name: "glm", timeoutMs: 20000 },
]
AGENT_ROUTES["copy_studio.deep_article"] = AGENT_ROUTES.deep_copywriter
AGENT_ROUTES["copy_studio.social_post"] = AGENT_ROUTES.content_producer
AGENT_ROUTES["copy_studio.video_script"] = AGENT_ROUTES.content_producer
AGENT_ROUTES["copy_studio.free_draft"] = AGENT_ROUTES.free_copywriter
AGENT_ROUTES["copy_studio.polish"] = [
  // 润色/改写是高频轻量操作：快模型优先、20s 超时、低成本直连兜底
  { name: "dashscope", model: "qwen-plus", timeoutMs: 20000 },
  { name: "qianfan", model: "ernie-4.5-turbo-32k", timeoutMs: 20000 },
  { name: "deepseek", timeoutMs: 20000 },
  { name: "jiekou", timeoutMs: 20000 },
  { name: "glm", timeoutMs: 20000 },
]
AGENT_ROUTES["copy_studio.rewrite"] = AGENT_ROUTES.deep_copywriter

/** 旧 agentId → copy_studio 模块键（兼容期；遥测确认零调用后删除旧键与别名） */
const LEGACY_AGENT_ALIAS: Record<string, string> = {
  deep_copywriter: "copy_studio.deep_article",
  content_producer: "copy_studio.social_post",
  free_copywriter: "copy_studio.free_draft",
  editor_text: "copy_studio.polish",
}

/** 统一创作台 copy_studio 的全部模块键（服务端 agentModule 白名单校验的单一事实源） */
export const COPY_STUDIO_MODULES = [
  "copy_studio.outline",
  "copy_studio.deep_article",
  "copy_studio.social_post",
  "copy_studio.video_script",
  "copy_studio.free_draft",
  "copy_studio.polish",
  "copy_studio.rewrite",
] as const

export type CopyStudioModule = (typeof COPY_STUDIO_MODULES)[number]

/** 旧 agentId 归一化为 copy_studio 模块键；非别名原样返回 */
export function normalizeAgentId(agentId: string): string {
  return LEGACY_AGENT_ALIAS[agentId] ?? agentId
}

/**
 * Build a provider chain from an explicit route list. Shared by getAgentLLM and
 * the A/B comparison harness so the override path constructs providers identically.
 */
function buildLLMFromRoutes(routes: AgentModelRoute[]): LLMClient {
  const allConfigs = getProviderConfigs()
  const configMap = new Map(allConfigs.map((c) => [c.name, c]))

  const providers: LLMProvider[] = []
  for (const route of routes) {
    const config = configMap.get(route.name)
    if (!config) continue
    const mergedConfig: LLMProviderConfig = {
      ...config,
      ...(route.model ? { defaultModel: route.model } : {}),
      ...(route.timeoutMs ? { timeoutMs: route.timeoutMs } : {}),
    }
    providers.push(new OpenAICompatibleProvider(mergedConfig))
  }

  if (providers.length === 0) {
    return LLMClient.shared()
  }

  return new LLMClient(providers)
}

/**
 * Per-agent model overrides for A/B comparison. When set, the named agent's
 * route chain is rewritten so the override is the first/preferred provider.
 * Production code never sets this; only the eval harness does, and clears it
 * after each candidate run.
 */
const agentModelOverrides = new Map<string, AgentModelRoute>()

/** Install a one-shot override for an agent (eval harness only). */
export function setAgentModelOverride(agentId: string, route: AgentModelRoute): void {
  agentModelOverrides.set(agentId, route)
}

/** Clear a previously installed override. */
export function clearAgentModelOverride(agentId: string): void {
  agentModelOverrides.delete(agentId)
}

/**
 * 根据智能体 ID 获取专用的 LLM 实例
 * 按路由配置构造 provider 链，每个 provider 用指定的模型
 *
 * If a model override is installed for this agent (A/B eval), the override
 * route is prepended so it becomes the preferred provider, while the original
 * chain still serves as fallback.
 */
export function getAgentLLM(agentId: string): LLMClient {
  const key = LEGACY_AGENT_ALIAS[agentId] ?? agentId
  const override = agentModelOverrides.get(agentId) ?? agentModelOverrides.get(key)
  const baseRoutes = AGENT_ROUTES[key]

  if (!baseRoutes) {
    if (override) {
      return buildLLMFromRoutes([override])
    }
    // 没有特殊配置，使用默认实例（provider 链按 config 顺序）
    return LLMClient.shared()
  }

  const routes = override ? [override, ...baseRoutes] : baseRoutes
  return buildLLMFromRoutes(routes)
}

/**
 * 获取智能体的推荐模型名称（用于日志/可观测）
 */
export function getAgentRecommendedModel(agentId: string): string {
  const key = LEGACY_AGENT_ALIAS[agentId] ?? agentId
  const override = agentModelOverrides.get(agentId) ?? agentModelOverrides.get(key)
  if (override) return override.model ?? override.name

  const routes = AGENT_ROUTES[key]
  if (!routes) return "default"

  const allConfigs = getProviderConfigs()
  const firstAvailable = routes.find((r) => allConfigs.some((c) => c.name === r.name))
  if (!firstAvailable) return "default"

  const config = allConfigs.find((c) => c.name === firstAvailable.name)
  return firstAvailable.model || config?.defaultModel || "default"
}
