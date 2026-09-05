import type { AimChatMessage } from "@/lib/api/aim-chat"
import { ApiError } from "@/lib/api/core"
import {
  appendAimFileAttachmentsToContent,
} from "@/lib/aim/file-attachments"
import { buildAimChatContent } from "@/lib/aim/chat-request"
import type { AimFileAttachment, AimImageAttachment } from "@/lib/aim/workbench-types"

/**
 * 极简版对话控制器：不依赖 React，可直接单测。
 * React 侧通过 useSyncExternalStore 订阅（见 use-lite-chat.ts）。
 */

export interface LiteChatMessage {
  role: "user" | "assistant"
  content: string
  /** 用户消息携带的图片（缩略图展示，发送时按多模态 image_url 上行） */
  images?: AimImageAttachment[]
  /** 用户消息携带的文件/音频附件数（仅计数徽标；正文已并入模型文本） */
  fileCount?: number
}

export interface LiteSendExtras {
  images?: AimImageAttachment[]
  files?: AimFileAttachment[]
}

export type LiteStreamFn = typeof import("@/lib/api/aim-chat").chatAimStream

export interface LiteChatControllerOptions {
  stream: LiteStreamFn
  /** 业务错误（超时/服务端错误）回调；用户主动停止不算错误 */
  onError?: (message: string) => void
  /** 会话绑定的 AIM 专家；缺省为通用大脑 */
  agentId?: string
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

  async function send(text: string, extras: LiteSendExtras = {}): Promise<void> {
    const images = extras.images ?? []
    const files = extras.files ?? []
    const trimmed = text.trim()
    if ((!trimmed && images.length === 0 && files.length === 0) || busy) return

    messages = [
      ...messages,
      {
        role: "user",
        content: trimmed || (images.length ? "请分析这张图片。" : "请查看我附带的文件。"),
        ...(images.length ? { images } : {}),
        ...(files.length ? { fileCount: files.length } : {}),
      },
      { role: "assistant", content: "" },
    ]
    busy = true
    abortController = new AbortController()
    notify()

    // 历史轮只上行纯文本；最新一条用户消息并入文件正文与图片多模态
    const history = messages.filter((message) => message.content).slice(0, -1)
    const latest = messages[messages.length - 2]
    const latestContent = buildAimChatContent(
      appendAimFileAttachmentsToContent(latest.content, files),
      images.map((image) => ({ readUrl: image.readUrl })),
    )
    const payload = [
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: latestContent },
    ] as AimChatMessage[]

    try {
      const result = await stream(payload, {
        agentId: options.agentId,
        signal: abortController.signal,
        onDelta: (_delta, content) => appendAssistantDelta(content),
      })
      // 流正常结束但零内容：多为服务端异常中断（网络截断/内部错误），按失败处理
      if (!result.content.trim()) {
        removeTrailingEmptyAssistant()
        onError?.("生成失败，请重试；若持续失败请联系客服")
      }
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
