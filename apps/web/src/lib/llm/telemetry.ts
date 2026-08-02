import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"

import type { ChatMessage, CompletionOptions, ModelCapability } from "./types"

export type ProviderAttemptStatus = "success" | "failed"

export interface ProviderAttempt {
  provider: string
  model?: string
  capability?: ModelCapability
  status: ProviderAttemptStatus
  error?: string
  errorKind?: ProviderErrorKind
  durationMs?: number
  attemptIndex: number
  responseModel?: string
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
}

export type ProviderErrorKind =
  | "network"
  | "timeout"
  | "rate_limit"
  | "client"
  | "server"
  | "config"
  | "auth"
  | "model_unavailable"
  | "unknown"

export interface LlmInvocation {
  messages: Array<{
    role: ChatMessage["role"]
    content: string | Array<{ type: "text"; text: string } | { type: "image_ref"; hash: string }>
  }>
  fullPrompt: string
  imageHashes: Array<{ hash: string; type: "data_url" | "remote_url" }>
  stream: boolean
  temperature?: number
  maxTokens?: number
}

export interface LlmTelemetryRecorder {
  onAttempt?: (attempt: ProviderAttempt) => void
  onInvocation?: (invocation: LlmInvocation) => void
}

const telemetryStorage = new AsyncLocalStorage<LlmTelemetryRecorder>()

/**
 * @description 运行withllmtelemetry
 * @param recorder - recorder
 * @param fn - 函数
 * @returns T
 */
export function runWithLlmTelemetry<T>(
  recorder: LlmTelemetryRecorder,
  fn: () => T,
): T {
  return telemetryStorage.run(recorder, fn)
}

/**
 * @description 包装llmtelemetryiterable
 * @param recorder - recorder
 * @param source - 来源
 * @returns AsyncIterable<T>
 */
export function wrapLlmTelemetryIterable<T>(
  recorder: LlmTelemetryRecorder,
  source: AsyncIterable<T>,
): AsyncIterable<T> {
  const iterator = source[Symbol.asyncIterator]()
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => runWithLlmTelemetry(recorder, () => iterator.next()),
        return: iterator.return
          ? (value?: unknown) => runWithLlmTelemetry(recorder, () => iterator.return!(value as never))
          : undefined,
        throw: iterator.throw
          ? (error?: unknown) => runWithLlmTelemetry(recorder, () => iterator.throw!(error))
          : undefined,
      }
    },
  }
}

/**
 * @description 上报providerattempt
 * @param attempt - attempt
 * @returns 无返回值
 */
export function reportProviderAttempt(attempt: ProviderAttempt): void {
  try {
    telemetryStorage.getStore()?.onAttempt?.(attempt)
  } catch {
    // Telemetry must never break the generation path.
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function sanitizeMessages(messages: ChatMessage[]): {
  messages: LlmInvocation["messages"]
  imageHashes: LlmInvocation["imageHashes"]
} {
  const imageHashes: LlmInvocation["imageHashes"] = []
  const sanitized = messages.map((message) => {
    if (typeof message.content === "string") {
      return { role: message.role, content: message.content }
    }
    return {
      role: message.role,
      content: message.content.map((part) => {
        if (part.type === "text") return { type: "text" as const, text: part.text }
        const url = part.image_url.url
        const image = {
          hash: sha256(url),
          type: url.startsWith("data:") ? "data_url" as const : "remote_url" as const,
        }
        imageHashes.push(image)
        return { type: "image_ref" as const, hash: image.hash }
      }),
    }
  })
  return { messages: sanitized, imageHashes }
}

function renderPrompt(messages: LlmInvocation["messages"]): string {
  return messages.map((message) => {
    const content = typeof message.content === "string"
      ? message.content
      : message.content.map((part) =>
          part.type === "text" ? part.text : `[image sha256=${part.hash}]`
        ).join("\n")
    return `[${message.role}]\n${content}`
  }).join("\n\n")
}

/**
 * @description 上报llminvocation
 * @param options - 配置选项
 * @param stream - 流
 * @returns 无返回值
 */
export function reportLlmInvocation(options: CompletionOptions, stream: boolean): void {
  const recorder = telemetryStorage.getStore()
  if (!recorder?.onInvocation) return
  const sanitized = sanitizeMessages(options.messages)
  try {
    recorder.onInvocation({
      messages: sanitized.messages,
      fullPrompt: renderPrompt(sanitized.messages),
      imageHashes: sanitized.imageHashes,
      stream,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })
  } catch {
    // Telemetry must never break the generation path.
  }
}

/**
 * @description 分类providererror
 * @param error - 错误对象
 * @returns 无返回值
 */
export function classifyProviderError(error: unknown): {
  kind: ProviderErrorKind
  retryable: boolean
} {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  const statusValue = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : NaN
  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/)
  const status = Number.isFinite(statusValue)
    ? statusValue
    : statusMatch ? Number(statusMatch[1]) : NaN

  if (!Number.isNaN(status)) {
    const modelUnavailable =
      /model.{0,40}(not found|unavailable|not available|unsupported|does not exist|invalid)/.test(lower) ||
      /(unsupported|invalid).{0,20}model/.test(lower) ||
      /not available in your region/.test(lower)
    if (modelUnavailable && (status === 400 || status === 403 || status === 404)) {
      return { kind: "model_unavailable", retryable: true }
    }
    if (status === 408) return { kind: "timeout", retryable: true }
    if (status === 429) return { kind: "rate_limit", retryable: true }
    if (status >= 500) return { kind: "server", retryable: true }
    // 部分中转站在额度/上游不可用时只返回空 403，无法提供可判定的鉴权正文。
    // 仅对此精确错误允许切换备用 provider；明确的 403 Forbidden 仍按鉴权失败处理。
    if (status === 403 && /status code \(no body\)/.test(lower)) {
      return { kind: "model_unavailable", retryable: true }
    }
    // 余额/配额耗尽必须允许降级到下一个 provider：DeepSeek 用 402（Payment Required）
    // 表达余额不足，其它中转站多用 403 + 余额文案；两者都不是请求本身有问题。
    if (status === 402 || (status === 403 && /(预扣费|剩余额度|额度不足|余额不足|insufficient (balance|credit|quota)|quota exceeded|credit balance|billing)/.test(lower))) {
      return { kind: "rate_limit", retryable: true }
    }
    if (status === 401 || status === 403) return { kind: "auth", retryable: false }
    if (status >= 400 && status < 500) return { kind: "client", retryable: false }
  }

  if (/(timeout|timed out|deadline|aborted)/.test(lower)) {
    return { kind: "timeout", retryable: true }
  }
  // provider 返回 200 但 choices 内容为空（如推理模型在 token 预算内只产出了
  // reasoning tokens），属于对端异常而非请求错误，必须允许降级到下一个 provider。
  if (/(empty response|empty completion|no output|empty choice)/.test(lower)) {
    return { kind: "server", retryable: true }
  }
  if (/(no providers configured|missing.*key|api[_ ]?key|baseurl|config)/.test(lower)) {
    return { kind: "config", retryable: false }
  }
  if (/(econnrefused|econnreset|enotfound|epipe|fetch failed|network|socket|getaddrinfo)/.test(lower)) {
    return { kind: "network", retryable: true }
  }

  // unknown 错误默认可重试：未分类错误多为瞬时异常，不应中断降级链
  return { kind: "unknown", retryable: true }
}
