import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"

import type { ChatMessage, CompletionOptions } from "./types"

export type ProviderAttemptStatus = "success" | "failed"

export interface ProviderAttempt {
  provider: string
  model?: string
  status: ProviderAttemptStatus
  error?: string
  errorKind?: ProviderErrorKind
  durationMs?: number
  attemptIndex: number
  responseModel?: string
  totalTokens?: number
}

export type ProviderErrorKind =
  | "network"
  | "timeout"
  | "rate_limit"
  | "client"
  | "server"
  | "config"
  | "auth"
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

export function runWithLlmTelemetry<T>(
  recorder: LlmTelemetryRecorder,
  fn: () => T,
): T {
  return telemetryStorage.run(recorder, fn)
}

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

export function classifyProviderError(error: unknown): {
  kind: ProviderErrorKind
  retryable: boolean
} {
  const message = error instanceof Error ? error.message : String(error)
  const statusValue = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : NaN
  const statusMatch = message.match(/\b(400|401|403|408|429|5\d{2})\b/)
  const status = Number.isFinite(statusValue)
    ? statusValue
    : statusMatch ? Number(statusMatch[1]) : NaN

  if (!Number.isNaN(status)) {
    if (status === 408) return { kind: "timeout", retryable: true }
    if (status === 429) return { kind: "rate_limit", retryable: true }
    if (status >= 500) return { kind: "server", retryable: true }
    if (status === 401 || status === 403) return { kind: "auth", retryable: false }
    if (status === 400) return { kind: "client", retryable: false }
  }

  const lower = message.toLowerCase()
  if (/(timeout|timed out|deadline|aborted)/.test(lower)) {
    return { kind: "timeout", retryable: true }
  }
  if (/(no providers configured|missing.*key|api[_ ]?key|baseurl|config)/.test(lower)) {
    return { kind: "config", retryable: false }
  }
  if (/(econnrefused|econnreset|enotfound|epipe|fetch failed|network|socket|getaddrinfo)/.test(lower)) {
    return { kind: "network", retryable: true }
  }

  return { kind: "unknown", retryable: false }
}
