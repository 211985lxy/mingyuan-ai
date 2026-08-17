"use client"

import { useCallback, useRef, useState } from "react"
import { ArrowUp, Plus, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { LiteMessageList } from "@/features/lite/components/lite-message-list"
import { useLiteChat } from "@/features/lite/use-lite-chat"

const EXAMPLE_PROMPTS = [
  "帮我写一条短视频口播文案，主题是「老板为什么要做个人 IP」",
  "把这段话改成小红书风格的种草文案",
  "帮我梳理本周内容选题，给出 5 个方向",
]

export default function LiteChatPage() {
  const { messages, busy, send, stop, reset } = useLiteChat()
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    if (busy || !input.trim()) return
    void send(input)
    setInput("")
    textareaRef.current?.focus()
  }, [busy, input, send])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 消息区（空会话显示欢迎语与示例） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
            <p className="text-xs font-medium text-primary">明动 AIM · 极简版</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">今天想聊点什么？</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              直接输入问题或需求，AIM 帮你写文案、理思路、做复盘。
            </p>
            <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-3">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="cursor-pointer rounded-lg border bg-card p-3.5 text-left text-xs leading-relaxed text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  onClick={() => {
                    setInput(prompt)
                    textareaRef.current?.focus()
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="mt-8 text-[11px] text-muted-foreground/70">
              需要选题、发布、数据复盘等完整工作台？
              <a href="/home" className="ml-1 text-primary hover:underline">前往完整版</a>
            </p>
          </div>
        ) : (
          <LiteMessageList messages={messages} busy={busy} />
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t bg-background px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:border-primary/40">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 cursor-pointer rounded-xl text-muted-foreground"
                    aria-label="开新对话"
                    disabled={busy || messages.length === 0}
                    onClick={() => {
                      reset()
                      setInput("")
                      textareaRef.current?.focus()
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                }
              />
              <TooltipContent side="top">开新对话</TooltipContent>
            </Tooltip>
            <Textarea
              ref={textareaRef}
              value={input}
              placeholder="输入你的问题，Enter 发送，Shift+Enter 换行"
              className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  handleSubmit()
                }
              }}
            />
            {busy ? (
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 cursor-pointer rounded-xl"
                aria-label="停止生成"
                onClick={stop}
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-9 shrink-0 cursor-pointer rounded-xl"
                aria-label="发送"
                disabled={!input.trim()}
                onClick={handleSubmit}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
            对话为临时会话，刷新后开启新对话
          </p>
        </div>
      </div>
    </div>
  )
}
