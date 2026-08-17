import type { AimChatMessage } from "@/lib/api/aim-chat"
import { ApiError } from "@/lib/api/core"

/**
 * 极简版对话控制器：不依赖 React，可直接单测。
 * React 侧通过 useSyncExternalStore 订阅（见 use-lite-chat.ts）。
 */

export interface LiteChatMessage {
  role: "user" | "assistant"
  content: string
}

export type LiteStreamFn = typeof import("@/lib/api/aim-chat").chatAimStream

export interface LiteChatControllerOptions {
  stream: LiteStreamFn
  /** 业务错误（超时/服务端错误）回调；用户主动停止不算错误 */
  onError?: (message: string) => void
}

export function createLiteChatController(options: LiteChatControllerOptions) {
  const { stream, onError } = options
  let messages: LiteChatMessage[] = []
  let busy = false
  let abortController: AbortController | null = null
  const listeners = new Set<() => void>()

  function notify() {
    for (const listener of listeners) listener()
  }

  /** 更新最后一条 assistant 消息内容（总创建新数组，保持 getSnapshot 引用语义） */
  function appendAssistantDelta(content: string) {
    const next = messages.slice()
    const last = next[next.length - 1]
    if (last && last.role === "assistant") {
      next[next.length - 1] = { ...last, content }
    } else {
      next.push({ role: "assistant", content })
    }
    messages = next
    notify()
  }

  function removeTrailingEmptyAssistant() {
    const last = messages[messages.length - 1]
    if (last && last.role === "assistant" && !last.content) {
      messages = messages.slice(0, -1)
    }
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    messages = [
      ...messages,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" },
    ]
    busy = true
    abortController = new AbortController()
    notify()

    // 极简版只用纯文本消息，直接满足 AimChatMessage 的 content 联合类型
    const payload = messages
      .filter((message) => message.content)
      .map((message) => ({ role: message.role, content: message.content })) as AimChatMessage[]

    try {
      await stream(payload, {
        signal: abortController.signal,
        onDelta: (_delta, content) => appendAssistantDelta(content),
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 499) {
        // 用户主动停止：保留已生成的部分内容，不算错误
      } else {
        removeTrailingEmptyAssistant()
        const message = error instanceof ApiError ? error.message : "回复失败，请稍后重试"
        onError?.(message)
      }
    } finally {
      busy = false
      abortController = null
      notify()
    }
  }

  function stop() {
    abortController?.abort()
  }

  function reset() {
    if (busy) abortController?.abort()
    messages = []
    notify()
  }

  return {
    send,
    stop,
    reset,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getMessages: () => messages,
    getBusy: () => busy,
  }
}

export type LiteChatController = ReturnType<typeof createLiteChatController>
