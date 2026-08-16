"use client"

import { useEffect, useRef } from "react"
import { Sparkles } from "lucide-react"

import { MarkdownRenderer } from "@/components/markdown-renderer"
import type { LiteChatMessage } from "@/features/lite/lite-chat-controller"

/**
 * 极简版消息流：用户右侧浅底气泡，AIM 左侧无框 markdown。
 * 流式期间 assistant 气泡底部显示打字光标。
 */
export function LiteMessageList({
  messages,
  busy,
}: {
  messages: LiteChatMessage[]
  busy: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastContent = messages[messages.length - 1]?.content ?? ""

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, lastContent])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1
        const streaming = busy && isLast && message.role === "assistant"

        if (message.role === "user") {
          return (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {message.content}
              </div>
            </div>
          )
        }

        return (
          <div key={index} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              {message.content ? (
                <div className="text-sm leading-relaxed">
                  <MarkdownRenderer content={message.content} />
                </div>
              ) : streaming ? (
                <span className="inline-flex items-center gap-1 py-2" aria-label="AIM 正在思考">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
      style={{ animationDelay: delay }}
    />
  )
}
