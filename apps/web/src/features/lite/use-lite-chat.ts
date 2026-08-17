"use client"

import { useCallback, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { chatAimStream } from "@/lib/api/aim-chat"
import {
  createLiteChatController,
  type LiteChatMessage,
} from "@/features/lite/lite-chat-controller"

/**
 * 极简版对话：内存态会话，刷新即新会话。
 * 复用 /api/aim/chat 流式接口，与完整版共用后端与鉴权。
 */
export function useLiteChat() {
  const [controller] = useState(() =>
    createLiteChatController({
      stream: chatAimStream,
      onError: (message) => toast.error(message),
    }),
  )

  const messages = useSyncExternalStore(controller.subscribe, controller.getMessages)
  const busy = useSyncExternalStore(controller.subscribe, controller.getBusy)

  const send = useCallback((text: string) => controller.send(text), [controller])
  const stop = useCallback(() => controller.stop(), [controller])
  const reset = useCallback(() => controller.reset(), [controller])

  return { messages, busy, send, stop, reset }
}

export type { LiteChatMessage }
