/**
 * 把生成/对话错误映射为对用户友好的文案，避免把英文/技术报错泄漏给终端用户。
 */
import type { ProviderAttempt } from "@/lib/llm/telemetry"

const CJK_PATTERN = /[\u4e00-\u9fff]/
const INTERNAL_AIM_ERROR_PATTERN = /^(?:语义理解|澄清协议|非澄清响应)/
const SEMANTIC_RECOVERY_MESSAGE = "这次没有完整理解你的要求，当前内容已保留。请再试一次，或补充一句最关键的要求。"

export type AimFailureCode =
  | "INVALID_REQUEST"
  | "BOUND_PROJECT_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH"
  | "PROVIDER_QUOTA"
  | "EMPTY_OUTPUT"
  | "DELIVERY_CONSTRAINT_VIOLATION"
  | "GENERATION_IN_PROGRESS"
  | "STALE_EXECUTION"
  | "USER_ABORTED"
  | "INTERNAL_ERROR"

export type AimFailureResponse = {
  error: string
  code: AimFailureCode
  recoverable: boolean
  runId?: string
  generationId?: string
  traceId?: string
  requestId: string
  retryAfterMs?: number
}

const USER_MESSAGE: Record<AimFailureCode, string> = {
  INVALID_REQUEST: "这次请求不完整，请核对后重新提交。",
  BOUND_PROJECT_UNAVAILABLE: "当前绑定的全案不可用，请先选择可用的 IP 营销全案。",
  MODEL_TIMEOUT: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  PROVIDER_UNAVAILABLE: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  PROVIDER_AUTH: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  PROVIDER_QUOTA: "模型服务额度不足，素材和要求已保留。请稍后重试或联系管理员。",
  EMPTY_OUTPUT: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
  DELIVERY_CONSTRAINT_VIOLATION: "生成结果没有满足你当前的要求，未作为正式成稿交付。",
  GENERATION_IN_PROGRESS: "同一生成任务仍在执行中，请稍候，不要重复提交。",
  STALE_EXECUTION: "本次生成超过等待上限，系统已停止继续消耗。素材和要求已保留，可直接重试。",
  USER_ABORTED: "已停止本次生成。素材和要求已保留，可直接再试一次。",
  INTERNAL_ERROR: "生成失败，请稍后重试",
}

const LEGACY_FAILURE_CODE: Record<string, AimFailureCode> = {
  MODEL_EMPTY_RESPONSE: "EMPTY_OUTPUT",
  MODEL_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_BALANCE: "PROVIDER_QUOTA",
  GENERATION_DEADLINE: "MODEL_TIMEOUT",
  DELIVERY_REASONING_LEAK: "DELIVERY_CONSTRAINT_VIOLATION",
  INSTRUCTION_MISMATCH: "DELIVERY_CONSTRAINT_VIOLATION",
  UNKNOWN: "INTERNAL_ERROR",
}

const NON_RECOVERABLE: ReadonlySet<AimFailureCode> = new Set([
  "PROVIDER_AUTH",
  "INVALID_REQUEST",
  "BOUND_PROJECT_UNAVAILABLE",
  "INTERNAL_ERROR",
])

function normalizeAimFailureCode(code: string): AimFailureCode | undefined {
  if (code in USER_MESSAGE) return code as AimFailureCode
  return LEGACY_FAILURE_CODE[code]
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
    this.recoverable = !NON_RECOVERABLE.has(input.code)
    this.providerAttempts = input.providerAttempts ?? []
    this.promptHash = input.promptHash
    this.contextHash = input.contextHash
    if (input.cause instanceof Error) this.cause = input.cause
  }
}

export function classifyAimFailure(error: unknown, attempts: ProviderAttempt[] = []): AimFailureCode {
  const rawCode = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : ""
  const normalized = rawCode ? normalizeAimFailureCode(rawCode) : undefined
  if (normalized) return normalized
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (INTERNAL_AIM_ERROR_PATTERN.test(message) || message.includes("连续修正后仍未完成当前要求")) {
    return "DELIVERY_CONSTRAINT_VIOLATION"
  }
  // 供应商全被熔断跳过 / 全链失败时抛出的占位错误，必须可恢复而不是 INTERNAL_ERROR
  if (/(all providers failed|全部模型线路.*熔断|线路.*熔断保护)/i.test(message)) {
    return "PROVIDER_UNAVAILABLE"
  }
  // 连接层错误（OpenAI 兼容 SDK 统一文案 "Connection error."、fetch failed 等）
  if (/(connection error|fetch failed|econnrefused|econnreset|enotfound|epipe|getaddrinfo)/i.test(message)) {
    return "PROVIDER_UNAVAILABLE"
  }
  const last = [...attempts].reverse().find((attempt) => attempt.status === "failed")
  if (last?.errorKind === "timeout") return "MODEL_TIMEOUT"
  if (last?.errorKind === "auth") return "PROVIDER_AUTH"
  if (last?.errorKind === "model_unavailable") return "PROVIDER_UNAVAILABLE"
  if (last?.errorKind === "network" || last?.errorKind === "unknown") {
    return "PROVIDER_UNAVAILABLE"
  }
  if (last?.errorKind === "rate_limit") {
    return /(balance|额度|余额|quota|credit|billing|402)/i.test(last.error || "")
      ? "PROVIDER_QUOTA"
      : "PROVIDER_UNAVAILABLE"
  }
  if (/(empty response|empty completion|no output)/i.test(message) || last?.errorKind === "server" && /empty/i.test(last.error || "")) {
    return "EMPTY_OUTPUT"
  }
  // 供应商侧 5xx / 未分类瞬时错误：可恢复，换线路重试（此前落 INTERNAL_ERROR 的黑洞）
  if (last?.errorKind === "server") {
    return "PROVIDER_UNAVAILABLE"
  }
  if (/(timeout|timed out|deadline)/i.test(message)) return "MODEL_TIMEOUT"
  if (/aborted|用户停止|已停止本次生成/i.test(message)) return "USER_ABORTED"
  return "INTERNAL_ERROR"
}

export function mapAimFailureCodeToUserMessage(code: AimFailureCode | string): string {
  return USER_MESSAGE[normalizeAimFailureCode(code) ?? "INTERNAL_ERROR"]
}

export function aimFailureHttpStatus(code: AimFailureCode): number {
  if (code === "INVALID_REQUEST" || code === "USER_ABORTED") return 400
  if (code === "GENERATION_IN_PROGRESS" || code === "BOUND_PROJECT_UNAVAILABLE") return 409
  if (code === "DELIVERY_CONSTRAINT_VIOLATION") return 422
  if (code === "MODEL_TIMEOUT" || code === "STALE_EXECUTION") return 504
  if (code === "INTERNAL_ERROR") return 500
  return 503
}

export function toAimFailureResponse(error: unknown, requestId: string): AimFailureResponse {
  const runError = error instanceof AimRunExecutionError ? error : null
  const code = runError?.code ?? classifyAimFailure(error)
  return {
    error: mapAimFailureCodeToUserMessage(code),
    code,
    recoverable: runError?.recoverable ?? !NON_RECOVERABLE.has(code),
    runId: runError?.runId,
    requestId,
    retryAfterMs: code === "MODEL_TIMEOUT" ? 0 : undefined,
  }
}

export function mapAimErrorToUserMessage(error: unknown, friendlyFallback: string): string {
  const message = error instanceof Error ? error.message : ""
  if (INTERNAL_AIM_ERROR_PATTERN.test(message)) return SEMANTIC_RECOVERY_MESSAGE
  const classified = classifyAimFailure(error)
  if (classified !== "INTERNAL_ERROR") return mapAimFailureCodeToUserMessage(classified)
  return message && CJK_PATTERN.test(message) ? message : friendlyFallback
}
