"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ImagePlus,
  ListChecks,
  Loader2,
  Mic,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
} from "lucide-react"

import { AimPastedCopyAttachmentBar } from "@/components/aim/aim-pasted-copy-attachment"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAimPasteCopyAttachment } from "@/features/aim/hooks/use-aim-paste-copy-attachment"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import {
  COPY_STUDIO_MODULES,
  COPY_STUDIO_MODULE_LABELS,
  type CopyStudioModule,
} from "@/lib/copy-studio"
import {
  canSubmitWithPasteAttachment,
  type PastedCopyAttachment,
} from "@/lib/aim/paste-copy-attachment"
import {
  getAimAgentCapabilities,
  type AimAgentCapabilities,
} from "@/lib/aim/agent-capabilities"
import { cn } from "@/lib/utils"

export type AimComposerMode = "direct" | "plan"

export interface AimPromptComposerProps {
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
  pastedCopy?: PastedCopyAttachment | null
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  onStyleSampleRequest?: (attachment: PastedCopyAttachment) => void
  styleEnabled?: boolean
  onOpenStyleAssets?: () => void
  /** 专家能力矩阵；不传则按「内容创作」全开兼容旧调用 */
  capabilities?: AimAgentCapabilities
}

const POPOVER_SHADOW =
  "shadow-[0_0_0_1px_rgba(239,231,220,0.95),0_12px_32px_-8px_rgba(37,33,29,0.12)]"

/** 悬浮输入卡片：文本 / 图片 / 长文附件 / 发送 */
export function AimPromptComposer(props: AimPromptComposerProps) {
  const {
    value, placeholder, busy, isRecording, isTranscribing, isGenerating, canGenerate,
    primaryActionLabel, onChange, onGenerate, onStop, onStartRecording, onStopRecording,
    showSkills = false, skills = [], onUseSkill, imageAttachments = [], onAddImages, onRemoveImage,
    composerMode = "direct", onComposerModeChange, canUsePlanMode = false, isPlanSessionActive = false,
    contentMode, onContentModeChange, showContentMode = false,
    pastedCopy = null, onPastedCopyChange, onStyleSampleRequest, styleEnabled = false, onOpenStyleAssets,
    capabilities: capabilitiesProp,
  } = props

  const capabilities = capabilitiesProp ?? getAimAgentCapabilities("content_producer")
  const isPlanMode = composerMode === "plan"
  const { applyUsage, handlePaste, allowedUsages, pasteEnabled } = useAimPasteCopyAttachment({
    value,
    pastedCopy,
    onPastedCopyChange: capabilities.pasteMode === "plain" ? undefined : onPastedCopyChange,
    onStyleSampleRequest: capabilities.styleSample ? onStyleSampleRequest : undefined,
    imageCount: imageAttachments.length,
    capabilities,
  })
  const effectivePasteUsage = pastedCopy?.usage
    ?? (allowedUsages.length === 1 ? allowedUsages[0] : undefined)
  const pasteReadyForSend = canSubmitWithPasteAttachment({
    text: value,
    attachment: pastedCopy
      ? { ...pastedCopy, usage: effectivePasteUsage }
      : null,
    hasImages: imageAttachments.length > 0,
  })
  const canSend = !busy && !isRecording && pasteReadyForSend
  const canPlan = !busy && !isRecording && value.trim().length > 0 && (!pastedCopy || Boolean(effectivePasteUsage))
  const canSubmit = (isPlanMode ? canPlan : canSend) && canGenerate && (!pastedCopy || Boolean(effectivePasteUsage && effectivePasteUsage !== "style_sample"))
  const canStop = busy && !isRecording && Boolean(onStop)
  const showContentModeControl = showContentMode && capabilities.contentModeSelector
  const showPlanModeControl = !isPlanSessionActive && Boolean(onComposerModeChange)
  const showAddMenu = Boolean(onAddImages) || showPlanModeControl || showContentModeControl || showSkills
  const autoUsageLabel =
    capabilities.pasteMode === "review"
      ? " · 待质检"
      : capabilities.pasteMode === "edit"
        ? " · 待编辑"
        : capabilities.pasteMode === "analytics"
          ? " · 发布数据"
          : undefined
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [contentModeExpanded, setContentModeExpanded] = useState(false)
  const [skillQuery, setSkillQuery] = useState("")
  const contentModeLabel = contentMode === undefined ? "智能选择" : COPY_STUDIO_MODULE_LABELS[contentMode]

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.max(Math.min(el.scrollHeight, 320), 48)}px`
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

  const closeAddMenu = () => {
    setAddMenuOpen(false)
    setContentModeExpanded(false)
    setSkillQuery("")
  }

  useEffect(() => {
    if (!addMenuOpen) return
    function closeOnOutside(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      closeAddMenu()
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      closeAddMenu()
    }
    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [addMenuOpen])

  const contentModeOptions = useMemo(() => ([
    { id: undefined as CopyStudioModule | undefined, label: "智能选择", hint: "按内容自动路由" },
    ...COPY_STUDIO_MODULES.map((module) => ({
      id: module as CopyStudioModule | undefined,
      label: COPY_STUDIO_MODULE_LABELS[module],
      hint: "",
    })),
  ]), [])

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
        {pastedCopy && pasteEnabled ? (
          <AimPastedCopyAttachmentBar
            attachment={pastedCopy}
            busy={busy}
            onRemove={() => onPastedCopyChange?.(null)}
            onSelectUsage={applyUsage}
            allowedUsages={allowedUsages}
            autoUsageLabel={autoUsageLabel}
          />
        ) : null}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={pasteEnabled ? handlePaste : undefined}
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
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {addMenuOpen ? (
          <div
            className={cn(
              "absolute bottom-[calc(100%+0.35rem)] left-2 z-20 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-popover text-popover-foreground",
              POPOVER_SHADOW,
            )}
          >
            <p className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
              添加图片、技能、模式…
            </p>
            <div className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
              {onAddImages ? (
                <button
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-50"
                  onClick={() => { fileInputRef.current?.click(); closeAddMenu() }}
                >
                  <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-foreground">图片</span>
                </button>
              ) : null}

              {showPlanModeControl && onComposerModeChange ? (
                <button
                  type="button"
                  disabled={busy || (!canUsePlanMode && !isPlanMode)}
                  title={!canUsePlanMode && !isPlanMode ? "请先选择 IP 营销全案" : isPlanMode ? "切回直接模式" : "开启计划模式"}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-50",
                    isPlanMode && "bg-primary/5",
                  )}
                  onClick={() => {
                    onComposerModeChange(isPlanMode ? "direct" : "plan")
                    closeAddMenu()
                  }}
                >
                  <ListChecks className={cn("h-4 w-4 shrink-0", isPlanMode ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">计划模式</span>
                    {isPlanMode ? <span className="ml-1.5 text-xs text-primary">已开启</span> : null}
                  </div>
                </button>
              ) : null}

              {showContentModeControl && onContentModeChange ? (
                <div className="py-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-50"
                    onClick={() => setContentModeExpanded((open) => !open)}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">创作模式</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{contentModeLabel}</span>
                    </div>
                  </button>
                  {contentModeExpanded ? (
                    <div className="ml-2 mt-0.5 border-l border-border/60 pl-2">
                      {contentModeOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className={cn(
                            "flex w-full flex-col rounded-lg px-2 py-1.5 text-left transition-colors",
                            contentMode === option.id ? "bg-primary/8 text-foreground" : "hover:bg-muted/60",
                          )}
                          onClick={() => {
                            onContentModeChange(option.id)
                            closeAddMenu()
                          }}
                        >
                          <span className={cn("text-sm", contentMode === option.id ? "font-medium" : "text-foreground/90")}>
                            {option.label}
                          </span>
                          {option.hint ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showSkills && skills.length > 0 ? (
                <>
                  {(onAddImages || showPlanModeControl || showContentModeControl) ? (
                    <div className="my-1.5 h-px bg-border/70" role="separator" />
                  ) : null}
                  <div className="px-1 pb-1">
                    <p className="px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground/80">技能</p>
                    {skills.length > 6 ? (
                      <div className="relative mb-1.5 px-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={skillQuery}
                          onChange={(event) => setSkillQuery(event.target.value)}
                          placeholder="搜索技能"
                          className="h-8 border-0 bg-muted/50 pl-8 text-xs shadow-none"
                          autoFocus
                        />
                      </div>
                    ) : null}
                    <div className="max-h-56 overflow-y-auto">
                      {skills.length === 0 ? (
                        <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">当前智能体暂无内置技能</p>
                      ) : filteredSkills.map(({ group, items }) => (
                        <div key={group || "_default"}>
                          {group ? (
                            <p className="sticky top-0 z-10 bg-popover px-2.5 pb-0.5 pt-1.5 text-[10px] font-medium tracking-wide text-muted-foreground/80">
                              {group}
                            </p>
                          ) : null}
                          {items.map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/70"
                              onClick={() => {
                                onUseSkill?.(skill)
                                closeAddMenu()
                              }}
                            >
                              <span className="block text-sm font-medium leading-5">{skill.label}</span>
                              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{skill.description}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                      {skills.length > 0 && filteredSkills.every(({ items }) => items.length === 0) ? (
                        <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">没有找到匹配技能</p>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0">
          <div className="flex min-w-0 items-center gap-1">
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
            {showAddMenu ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                className={cn(
                  "h-8 w-8 rounded-full p-0 transition-colors",
                  addMenuOpen
                    ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                onClick={() => setAddMenuOpen((open) => !open)}
                disabled={busy}
                title="添加图片、技能、模式…"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : null}
            {styleEnabled && capabilities.styleSample ? (
              <button
                type="button"
                onClick={onOpenStyleAssets}
                className="inline-flex h-7 max-w-[9rem] items-center truncate rounded-full px-2 text-[11px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                title="查看我的表达风格"
              >
                我的风格 · 已启用
              </button>
            ) : null}
            {(isTranscribing || isRecording || isPlanMode) ? (
              <span className="truncate text-xs text-muted-foreground">
                {isTranscribing ? "语音转写中…" : isRecording ? "录音中" : "计划模式"}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-foreground"
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={busy && !isRecording}
              title={isRecording ? "停止录音" : "语音输入"}
            >
              {isRecording ? <Square className="h-3.5 w-3.5 text-red-500" /> : <Mic className="h-4 w-4" />}
            </Button>
            {canStop ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-full p-0 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                onClick={onStop}
                title="停止生成"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={onGenerate}
              disabled={!canSubmit}
              className={cn("h-9 rounded-full shadow-none", isPlanMode ? "gap-1.5 px-4" : "w-9 p-0")}
              title={isPlanMode ? "开始规划" : primaryActionLabel}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : isPlanMode ? <ListChecks className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {isPlanMode ? <span className="text-sm">规划</span> : null}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
