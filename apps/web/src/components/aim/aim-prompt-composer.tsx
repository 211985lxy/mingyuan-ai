"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  ListChecks,
  Loader2,
  Mic,
  Search,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import {
  COPY_STUDIO_MODULES,
  COPY_STUDIO_MODULE_LABELS,
  type CopyStudioModule,
} from "@/lib/copy-studio"
import {
  canSubmitWithPasteAttachment,
  createPastedCopyAttachment,
  formatCharCount,
  inferPasteUsageFromInstruction,
  isLongCopyPaste,
  type PastedCopyAttachment,
  type PasteUsage,
} from "@/lib/aim/paste-copy-attachment"
import { cn } from "@/lib/utils"

export type AimComposerMode = "direct" | "plan"

interface AimPromptComposerProps {
  value: string
  placeholder: string
  busy: boolean
  isRecording: boolean
  isTranscribing: boolean
  isGenerating: boolean
  canGenerate: boolean
  primaryActionLabel: string
  onChange: (value: string) => void
  onGenerate: () => void
  onStop?: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  showSkills?: boolean
  skills?: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  imageAttachments?: Array<{ id: string; name: string; previewUrl: string }>
  onAddImages?: (files: FileList) => void
  onRemoveImage?: (id: string) => void
  composerMode?: AimComposerMode
  onComposerModeChange?: (mode: AimComposerMode) => void
  canUsePlanMode?: boolean
  isPlanSessionActive?: boolean
  contentMode?: CopyStudioModule | undefined
  onContentModeChange?: (value: CopyStudioModule | undefined) => void
  showContentMode?: boolean
  /** 长文粘贴附件 */
  pastedCopy?: PastedCopyAttachment | null
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  onStyleSampleRequest?: (attachment: PastedCopyAttachment) => void
  /** 工具栏「我的风格 · 已启用」 */
  styleEnabled?: boolean
  onOpenStyleAssets?: () => void
}

/**
 * 对标 Claude / ChatGPT：悬浮输入卡片 + 工具条内模式下拉。
 */
export function AimPromptComposer({
  value,
  placeholder,
  busy,
  isRecording,
  isTranscribing,
  isGenerating,
  canGenerate,
  primaryActionLabel,
  onChange,
  onGenerate,
  onStop,
  onStartRecording,
  onStopRecording,
  showSkills = false,
  skills = [],
  onUseSkill,
  imageAttachments = [],
  onAddImages,
  onRemoveImage,
  composerMode = "direct",
  onComposerModeChange,
  canUsePlanMode = false,
  isPlanSessionActive = false,
  contentMode,
  onContentModeChange,
  showContentMode = false,
  pastedCopy = null,
  onPastedCopyChange,
  onStyleSampleRequest,
  styleEnabled = false,
  onOpenStyleAssets,
}: AimPromptComposerProps) {
  const isPlanMode = composerMode === "plan"
  const pasteReady = canSubmitWithPasteAttachment({
    text: value,
    attachment: pastedCopy,
    hasImages: imageAttachments.length > 0,
  })
  const canSend = !busy && !isRecording && pasteReady
  const canPlan = !busy && !isRecording && value.trim().length > 0 && (!pastedCopy || Boolean(pastedCopy.usage))
  const canSubmit = (isPlanMode ? canPlan : canSend) && canGenerate && (!pastedCopy || Boolean(pastedCopy.usage && pastedCopy.usage !== "style_sample"))
  const canStop = busy && !isRecording && Boolean(onStop)
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState("")
  const [copyExpanded, setCopyExpanded] = useState(false)

  const contentModeLabel =
    contentMode === undefined ? "智能选择" : COPY_STUDIO_MODULE_LABELS[contentMode]

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    const next = Math.min(el.scrollHeight, 320)
    el.style.height = `${Math.max(next, 48)}px`
  }, [value])

  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    const base = query
      ? skills.filter((skill) => `${skill.label} ${skill.description}`.toLowerCase().includes(query))
      : skills
    const groups: Array<{ group: string; items: AimWorkbenchSkill[] }> = []
    for (const skill of base) {
      const key = skill.group ?? ""
      const existing = groups.find((g) => g.group === key)
      if (existing) existing.items.push(skill)
      else groups.push({ group: key, items: [skill] })
    }
    return groups
  }, [skillQuery, skills])

  useEffect(() => {
    if (!skillsOpen && !modeOpen) return

    function closeOnOutside(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setSkillsOpen(false)
      setModeOpen(false)
      setSkillQuery("")
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setSkillsOpen(false)
      setModeOpen(false)
      setSkillQuery("")
    }

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [skillsOpen, modeOpen])

  const applyUsage = useCallback((usage: PasteUsage) => {
    if (!pastedCopy || !onPastedCopyChange) return
    const next = { ...pastedCopy, usage }
    onPastedCopyChange(next)
    if (usage === "style_sample") onStyleSampleRequest?.(next)
  }, [onPastedCopyChange, onStyleSampleRequest, pastedCopy])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPastedCopyChange) return
    const pasted = event.clipboardData.getData("text/plain")
    if (!isLongCopyPaste(pasted)) return

    event.preventDefault()
    const instruction = value.trim()
    const inferred = inferPasteUsageFromInstruction(instruction)
    const next = createPastedCopyAttachment(pasted, inferred)

    if (pastedCopy) {
      const replace = window.confirm("已有一篇文案附件。确定替换？取消则追加到现有附件。")
      if (replace) {
        onPastedCopyChange(next)
      } else {
        const merged = createPastedCopyAttachment(
          `${pastedCopy.content.trim()}\n\n${pasted.trim()}`,
          pastedCopy.usage ?? inferred,
        )
        onPastedCopyChange(merged)
      }
    } else {
      onPastedCopyChange(next)
    }
    setCopyExpanded(false)
    if (inferred === "style_sample") {
      toast.message("已识别为风格样本，将打开风格预览")
      onStyleSampleRequest?.(next)
    }
  }, [onPastedCopyChange, onStyleSampleRequest, pastedCopy, value])

  // 输入变化时，若已有附件且尚未选用途，尝试从指令自动推断
  useEffect(() => {
    if (!pastedCopy || pastedCopy.usage || !onPastedCopyChange) return
    const inferred = inferPasteUsageFromInstruction(value)
    if (!inferred) return
    onPastedCopyChange({ ...pastedCopy, usage: inferred })
    if (inferred === "style_sample") onStyleSampleRequest?.({ ...pastedCopy, usage: inferred })
  }, [value, pastedCopy, onPastedCopyChange, onStyleSampleRequest])

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-6xl xl:max-w-7xl">
      <div
        className={cn(
          "relative overflow-visible rounded-[18px] bg-card/95 backdrop-blur-md",
          "shadow-[0_0_0_1px_rgba(239,231,220,0.9),0_10px_36px_-14px_rgba(37,33,29,0.14)]",
          "focus-within:shadow-[0_0_0_1px_rgba(209,74,51,0.28),0_14px_44px_-14px_rgba(209,74,51,0.18)]",
          "transition-shadow",
        )}
      >
        {pastedCopy ? (
          <div className="mx-3 mt-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  文案附件 · {formatCharCount(pastedCopy.charCount)}字
                  {pastedCopy.usage === "edit" ? " · 待修改" : null}
                  {pastedCopy.usage === "benchmark" ? " · 对标参考" : null}
                  {pastedCopy.usage === "style_sample" ? " · 风格样本" : null}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setCopyExpanded((v) => !v)}
              >
                {copyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {copyExpanded ? "收起" : "展开"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => onPastedCopyChange?.(null)}
                disabled={busy}
                title="移除文案附件"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {copyExpanded ? (
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                {pastedCopy.content}
              </pre>
            ) : null}
            {!pastedCopy.usage ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  检测到一篇文案 · {formatCharCount(pastedCopy.charCount)}字
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyUsage("edit")}>
                  修改这篇
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyUsage("benchmark")}>
                  作为对标参考
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyUsage("style_sample")}>
                  沉淀为我的风格
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            if (canSubmit) onGenerate()
          }}
          rows={1}
          placeholder={placeholder}
          disabled={busy}
          className="max-h-[320px] min-h-[48px] w-full resize-none overflow-y-auto bg-transparent px-4 pb-2 pt-3.5 text-base leading-7 tracking-[-0.01em] outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />

        {imageAttachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-2">
            {imageAttachments.map((image) => (
              <div key={image.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                <img src={image.previewUrl} alt={image.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                  onClick={() => onRemoveImage?.(image.id)}
                  disabled={busy}
                  title="移除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showContentMode && onContentModeChange && modeOpen && (
          <div className="absolute bottom-14 left-3 z-20 w-52 overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.14)]">
            {(
              [
                { id: undefined as CopyStudioModule | undefined, label: "智能选择", hint: "按内容自动路由" },
                ...COPY_STUDIO_MODULES.map((module) => ({
                  id: module as CopyStudioModule | undefined,
                  label: COPY_STUDIO_MODULE_LABELS[module],
                  hint: "",
                })),
              ]
            ).map((option) => {
              const active = contentMode === option.id
              return (
                <button
                  key={option.label}
                  type="button"
                  className={cn(
                    "flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors",
                    active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
                  )}
                  onClick={() => {
                    onContentModeChange(option.id)
                    setModeOpen(false)
                  }}
                >
                  <span className={cn("text-sm", active ? "font-medium text-foreground" : "text-foreground/85")}>
                    {option.label}
                  </span>
                  {option.hint ? (
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}

        {showSkills && skillsOpen && (
          <div className="absolute bottom-14 left-3 z-20 w-[min(420px,calc(100vw-2rem))] rounded-xl bg-popover p-2 text-popover-foreground shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.14)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.target.value)}
                placeholder="搜索技能"
                className="h-8 border-0 bg-muted/50 pl-8 text-xs shadow-none"
                autoFocus
              />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {skills.length === 0 ? (
                <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">当前智能体暂无内置技能</p>
              ) : filteredSkills.map(({ group, items }) => (
                <div key={group || "_default"}>
                  {group && (
                    <p className="sticky top-0 z-10 bg-popover px-2.5 pb-1 pt-2 text-[10px] font-medium tracking-wide text-muted-foreground/80">
                      {group}
                    </p>
                  )}
                  {items.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        onUseSkill?.(skill)
                        setSkillsOpen(false)
                        setSkillQuery("")
                      }}
                    >
                      <span className="block text-sm font-medium leading-5">{skill.label}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{skill.description}</span>
                    </button>
                  ))}
                </div>
              ))}
              {skills.length > 0 && filteredSkills.length === 0 && (
                <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">没有找到匹配技能</p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0">
          <div className="flex min-w-0 items-center gap-0.5">
            {showContentMode && onContentModeChange ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setModeOpen((open) => !open)
                  setSkillsOpen(false)
                }}
                className={cn(
                  "inline-flex h-7 max-w-[10.5rem] items-center gap-1 rounded-full px-2.5 text-xs transition-colors",
                  modeOpen || contentMode
                    ? "bg-foreground/[0.06] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
                title="创作模式"
              >
                <Sparkles className="h-4 w-4 shrink-0 opacity-70" />
                <span className="truncate">{contentModeLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </button>
            ) : null}

            {!isPlanSessionActive && onComposerModeChange ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 gap-1 rounded-full px-2.5 text-xs",
                  isPlanMode ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onComposerModeChange(isPlanMode ? "direct" : "plan")}
                disabled={busy || (!canUsePlanMode && !isPlanMode)}
                title={!canUsePlanMode && !isPlanMode ? "请先选择 IP 营销全案" : isPlanMode ? "切回直接模式" : "开启计划模式"}
              >
                <ListChecks className="h-4 w-4" />
                计划
              </Button>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) onAddImages?.(event.target.files)
                event.target.value = ""
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              title="添加图片"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>

            {showSkills ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 gap-1 rounded-full px-2.5 text-xs",
                  skillsOpen ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setSkillsOpen((open) => !open)
                  setModeOpen(false)
                }}
                disabled={busy}
              >
                技能
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            ) : null}

            {styleEnabled ? (
              <button
                type="button"
                onClick={onOpenStyleAssets}
                className="ml-1 inline-flex h-7 items-center rounded-full px-2 text-[11px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                title="查看我的表达风格"
              >
                我的风格 · 已启用
              </button>
            ) : null}

            {(isTranscribing || isRecording || isPlanMode) && (
              <span className="ml-1 truncate text-xs text-muted-foreground">
                {isTranscribing
                  ? "语音转写中…"
                  : isRecording
                    ? "录音中"
                    : "计划模式"}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={busy && !isRecording}
              title="语音输入"
            >
              {isRecording ? <span className="text-xs text-red-500">停</span> : <Mic className="h-4 w-4" />}
            </Button>

            {canStop && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-full px-2.5 text-xs text-red-600"
                onClick={onStop}
                title="停止"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={onGenerate}
              disabled={!canSubmit}
              className={cn(
                "h-9 rounded-full shadow-none",
                isPlanMode ? "gap-1.5 px-4" : "w-9 p-0",
              )}
              title={isPlanMode ? "开始规划" : primaryActionLabel}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlanMode ? (
                <ListChecks className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isPlanMode && <span className="text-sm">规划</span>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
