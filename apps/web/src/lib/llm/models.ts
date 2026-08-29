/**
 * 跨网关模型名注册表（单一事实源）。
 *
 * 背景：模型名散落多处硬编码曾导致 openai/gpt-5.4（OpenRouter 命名）被发给
 * 直连供应商 deepseek 而 400。所有会作为 `model:` 显式传给 LLM 的默认模型名
 * 统一从这里引用；跨网关名（含 /）只允许发给聚合网关（见 createGatewayLLM
 * 与 provider.supportsModel 的预检过滤）。
 */
export const CROSS_GATEWAY_MODELS = {
  /** 中文长文案质感主力（模型路由规范：深度文案 → Claude） */
  claudeSonnet: "anthropic/claude-sonnet-4.6",
} as const

export type CrossGatewayModel = (typeof CROSS_GATEWAY_MODELS)[keyof typeof CROSS_GATEWAY_MODELS]
