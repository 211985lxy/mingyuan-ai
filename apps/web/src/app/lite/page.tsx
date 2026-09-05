"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp, Paperclip, Plus, RotateCcw, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LiteMessageList } from "@/features/lite/components/lite-message-list"
import { useLiteChat } from "@/features/lite/use-lite-chat"
import { useAimImageAttachments } from "@/hooks/use-aim-image-attachments"
import { useAimFileAttachments } from "@/hooks/use-aim-file-attachments"
import { ImageAttachments, FileAttachmentChips } from "@/components/aim/aim-prompt-composer-shell"
import { collectPasteFiles, splitPastedFiles } from "@/lib/aim/file-attachments"

const EXAMPLE_PROMPTS = [
  "帮我写一条短视频口播文案，主题是「老板为什么要做个人 IP」",
  "把这段话改成小红书风格的种草文案",
  "帮我梳理本周内容选题，给出 5 个方向",
]

/** 左下角「+」弹出菜单：添加文件（图片/文档/音频）；拖入输入框等效。 */
function LiteAddMenu(props: { busy: boolean; onPickFiles: () => void }) {
  const { busy, onPickFiles } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        aria-label="添加"
        aria-expanded={open}
        disabled={busy}
        className="size-9 shrink-0 cursor-pointer rounded-xl text-muted-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus className="size-4" />
      </Button>
      {open ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-60 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/70"
            onClick={() => {
              setOpen(false)
              onPickFiles()
            }}
          >
            <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              <span>添加文件</span>
              <span className="text-[11px] text-muted-foreground">
                图片 / 文档 / 音频，也可直接拖入输入框
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function LiteChatPage() {
  const { messages, busy, send, stop, reset } = useLiteChat()
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const {
    imageAttachments, isUploadingImage, addImages, removeImage, clearImages,
  } = useAimImageAttachments()
  const {
    fileAttachments, isUploadingFiles, addFiles, removeFile, clearFiles,
  } = useAimFileAttachments()

  const routeFiles = useCallback((files: File[]) => {
    const { images, documents } = splitPastedFiles(files)
    if (images.length) void addImages(images)
    if (documents.length) void addFiles(documents)
  }, [addImages, addFiles])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = collectPasteFiles(event.clipboardData)
    if (files.length === 0) return
    event.preventDefault()
    routeFiles(files)
  }, [routeFiles])

  const hasAttachments = imageAttachments.length > 0 || fileAttachments.length > 0
  const attachmentPending = isUploadingImage || isUploadingFiles

  const handleSubmit = useCallback(() => {
    if (busy || attachmentPending) return
    if (!input.trim() && !hasAttachments) return
    void send(input, { images: imageAttachments, files: fileAttachments })
    setInput("")
    clearImages()
    clearFiles()
    textareaRef.current?.focus()
  }, [attachmentPending, busy, clearFiles, clearImages, fileAttachments, hasAttachments, imageAttachments, input, send])

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

      {/* 输入区：整卡可拖放文件 */}
      <div className="shrink-0 border-t bg-background px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <div
            className={`relative rounded-2xl border bg-card p-2 shadow-sm focus-within:border-primary/40 ${dragOver ? "border-primary/60 bg-primary/5" : ""}`}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
                event.preventDefault()
                setDragOver(true)
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
              if (droppedFiles.length === 0) return
              event.preventDefault()
              setDragOver(false)
              routeFiles(droppedFiles)
            }}
          >
            {dragOver ? (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-primary/10">
                <span className="rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow">
                  松开以添加文件
                </span>
              </div>
            ) : null}
            {hasAttachments ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 pl-1">
                <ImageAttachments bare imageAttachments={imageAttachments} onRemoveImage={removeImage} busy={busy} />
                <FileAttachmentChips bare fileAttachments={fileAttachments} onRemoveFile={removeFile} busy={busy} />
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  if (files.length) routeFiles(files)
                  event.target.value = ""
                }}
              />
              <LiteAddMenu busy={busy} onPickFiles={() => fileInputRef.current?.click()} />
              <Textarea
                ref={textareaRef}
                value={input}
                placeholder="输入你的问题，可直接粘贴图片/文件，Enter 发送"
                className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
                rows={1}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
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
                  disabled={attachmentPending || (!input.trim() && !hasAttachments)}
                  onClick={handleSubmit}
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted-foreground/70">
            <span>对话为临时会话，刷新后开启新对话</span>
            {messages.length > 0 ? (
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                disabled={busy}
                onClick={() => {
                  reset()
                  setInput("")
                  clearImages()
                  clearFiles()
                  textareaRef.current?.focus()
                }}
              >
                <RotateCcw className="size-3" aria-hidden />
                开新对话
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
