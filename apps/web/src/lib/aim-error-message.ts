/**
 * 把生成/对话错误映射为对用户友好的文案，避免把英文/技术报错泄漏给终端用户。
 */
import type { ProviderAttempt } from "@/lib/llm/telemetry"

const CJK_PATTERN = /[\u4e00-\u9fff]/
const INTERNAL_AIM_ERROR_PATTERN = /^(?:语义理解|澄清协议|非澄清响应)/
const SEMANTIC_RECOVERY_MESSAGE = "这次没有完整理解你的要求，当前内容已保留。请再试一次，或补充一句最关键的要求。"

export type AimFailureCode =
  | "MODEL_TIMEOUT"
  | "MODEL_EMPTY_RESPONSE"
  | "MODEL_UNAVAILABLE"
  | "PROVIDER_AUTH"
  | "PROVIDER_BALANCE"
  | "GENERATION_DEADLINE"
  | "DELIVERY_REASONING_LEAK"
  | "INSTRUCTION_MISMATCH"
  | "STALE_EXECUTION"
  | "UNKNOWN"

export type AimFailureResponse = {
  error: string
  code: AimFailureCode
  recoverable: boolean
  runId?: string
  requestId: string
  retryAfterMs?: number
}

const USER_MESSAGE: Record<AimFailureCode, string> = {
  MODEL_TIMEOUT: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  MODEL_EMPTY_RESPONSE: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  MODEL_UNAVAILABLE: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  PROVIDER_AUTH: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  PROVIDER_BALANCE: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  GENERATION_DEADLINE: "本次生成超过等待上限，系统已停止继续消耗。素材和要求已保留，可直接重试。",
  DELIVERY_REASONING_LEAK: "生成结果没有满足你当前的要求，未作为正式成稿交付。",
  INSTRUCTION_MISMATCH: "生成结果没有满足你当前的要求，未作为正式成稿交付。",
  STALE_EXECUTION: "本次生成超过等待上限，系统已停止继续消耗。素材和要求已保留，可直接重试。",
  UNKNOWN: "生成失败，请稍后重试",
}

export class AimRunExecutionError extends Error {
  readonly code: AimFailureCode
  readonly runId: string
  readonly recoverable: boolean
  readonly providerAttempts: ProviderAttempt[]
  readonly promptHash?: string
  readonly contextHash?: string

  constructor(input: {
    code: AimFailureCode
    runId: string
    message?: string
    cause?: unknown
    providerAttempts?: ProviderAttempt[]
    promptHash?: string
    contextHash?: string
  }) {
    super(input.message || USER_MESSAGE[input.code])
    this.name = "AimRunExecutionError"
    this.code = input.code
    this.runId = input.runId
    this.recoverable = input.code !== "UNKNOWN" && input.code !== "PROVIDER_AUTH"
    this.providerAttempts = input.providerAttempts ?? []
    this.promptHash = input.promptHash
    this.contextHash = input.contextHash
    if (input.cause instanceof Error) this.cause = input.cause
  }
}

export function classifyAimFailure(error: unknown, attempts: ProviderAttempt[] = []): AimFailureCode {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : ""
  if (code === "GENERATION_DEADLINE" || code === "DELIVERY_REASONING_LEAK") return code
  if (code in USER_MESSAGE) return code as AimFailureCode
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (INTERNAL_AIM_ERROR_PATTERN.test(message) || message.includes("连续修正后仍未完成当前要求")) {
    return "INSTRUCTION_MISMATCH"
  }
  const last = [...attempts].reverse().find((attempt) => attempt.status === "failed")
  if (last?.errorKind === "timeout") return "MODEL_TIMEOUT"
  if (last?.errorKind === "auth") return "PROVIDER_AUTH"
  if (last?.errorKind === "model_unavailable") return "MODEL_UNAVAILABLE"
  if (last?.errorKind === "rate_limit" && /(balance|额度|余额|quota|credit|402)/i.test(last.error || "")) {
    return "PROVIDER_BALANCE"
  }
  if (/(empty response|empty completion|no output)/i.test(message) || last?.errorKind === "server" && /empty/i.test(last.error || "")) {
    return "MODEL_EMPTY_RESPONSE"
  }
  if (/(timeout|timed out|deadline)/i.test(message)) return "MODEL_TIMEOUT"
  return "UNKNOWN"
}

export function mapAimFailureCodeToUserMessage(code: AimFailureCode): string {
  return USER_MESSAGE[code]
}

export function aimFailureHttpStatus(code: AimFailureCode): number {
  if (code === "GENERATION_DEADLINE" || code === "STALE_EXECUTION") return 504
  if (code === "DELIVERY_REASONING_LEAK" || code === "INSTRUCTION_MISMATCH") return 422
  if (code === "UNKNOWN") return 500
  return 503
}

export function toAimFailureResponse(error: unknown, requestId: string): AimFailureResponse {
  const runError = error instanceof AimRunExecutionError ? error : null
  const code = runError?.code ?? classifyAimFailure(error)
  return {
    error: mapAimFailureCodeToUserMessage(code),
    code,
    recoverable: runError?.recoverable ?? (code !== "UNKNOWN" && code !== "PROVIDER_AUTH"),
    runId: runError?.runId,
    requestId,
    retryAfterMs: code === "GENERATION_DEADLINE" ? 0 : undefined,
  }
}

export function mapAimErrorToUserMessage(error: unknown, friendlyFallback: string): string {
  const message = error instanceof Error ? error.message : ""
  if (INTERNAL_AIM_ERROR_PATTERN.test(message)) return SEMANTIC_RECOVERY_MESSAGE
  const classified = classifyAimFailure(error)
  if (classified !== "UNKNOWN") return mapAimFailureCodeToUserMessage(classified)
  return message && CJK_PATTERN.test(message) ? message : friendlyFallback
}
