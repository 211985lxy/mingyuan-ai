"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
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
          "relative overflow-visible rounded-[20px] bg-gradient-to-br from-card via-card/95 to-secondary/30 backdrop-blur-md",
          "shadow-[0_0_0_1px_rgba(239,231,220,0.95),0_12px_40px_-16px_rgba(37,33,29,0.16),0_2px_8px_-4px_rgba(37,33,29,0.06)]",
          "focus-within:shadow-[0_0_0_1.5px_rgba(209,74,51,0.32),0_18px_52px_-16px_rgba(209,74,51,0.2),0_3px_12px_-4px_rgba(209,74,51,0.1)]",
          "transition-all duration-200",
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
          className="max-h-[320px] min-h-[52px] w-full resize-none overflow-y-auto bg-transparent px-4 pb-2 pt-4 text-[15px] leading-[1.75] tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground/80 disabled:opacity-60"
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
              "absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(460px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-popover text-popover-foreground",
              POPOVER_SHADOW,
            )}
          >
            <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-muted/60 via-muted/30 to-transparent px-3.5 py-2.5">
              <div>
                <p className="text-[13px] font-semibold tracking-tight text-foreground">添加附件 / 技能</p>
                <p className="text-[11px] text-muted-foreground/90">图片、创作模式、内置技能一键加入上下文</p>
              </div>
            </div>
            <div className="max-h-[min(480px,62vh)] overflow-y-auto p-2.5">
              {/* Quick actions: 图片 / 计划模式 / 创作模式 — 卡片式紧凑排列 */}
              <div className="mb-2.5 grid grid-cols-2 gap-2">
                {onAddImages ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="group flex flex-col items-start gap-1.5 rounded-xl border border-border/80 bg-card/50 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] disabled:opacity-50 disabled:hover:translate-y-0"
                    onClick={() => { fileInputRef.current?.click(); closeAddMenu() }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/12 to-indigo-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/15">
                        <ImagePlus className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <div className="mt-0.5">
                      <p className="text-[13px] font-semibold leading-4 text-foreground">图片</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/90">上传参考图、产品图、手绘图</p>
                    </div>
                  </button>
                ) : null}

                {showPlanModeControl && onComposerModeChange ? (
                  <button
                    type="button"
                    disabled={busy || (!canUsePlanMode && !isPlanMode)}
                    title={!canUsePlanMode && !isPlanMode ? "请先选择 IP 营销全案" : isPlanMode ? "切回直接模式" : "开启计划模式"}
                    className={cn(
                      "group flex flex-col items-start gap-1.5 rounded-xl border bg-card/50 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0",
                      isPlanMode
                        ? "border-primary/35 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent"
                        : "border-border/80 hover:border-primary/30 hover:bg-primary/[0.04]",
                    )}
                    onClick={() => {
                      onComposerModeChange(isPlanMode ? "direct" : "plan")
                      closeAddMenu()
                    }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className={cn(
                        "inline-flex size-7 items-center justify-center rounded-lg ring-1 ring-inset",
                        isPlanMode
                          ? "bg-gradient-to-br from-primary/15 to-amber-500/10 text-primary ring-primary/15"
                          : "bg-gradient-to-br from-violet-500/12 to-fuchsia-500/10 text-violet-600 ring-violet-500/15",
                      )}>
                        <ListChecks className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="flex items-center gap-1">
                        {isPlanMode ? (
                          <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            开启
                          </span>
                        ) : null}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </div>
                    <div className="mt-0.5">
                      <p className="text-[13px] font-semibold leading-4 text-foreground">计划模式</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/90">
                        {isPlanMode ? "先拆解规格再生成，结果更可控" : "先问你几个关键问题再动笔"}
                      </p>
                    </div>
                  </button>
                ) : null}
              </div>

              {showContentModeControl && onContentModeChange ? (
                <div className="mb-2.5 rounded-xl border border-border/70 bg-card/30 p-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    className="flex w-full items-center gap-2.5 text-left transition-colors"
                    onClick={() => setContentModeExpanded((open) => !open)}
                  >
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/12 to-orange-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/15">
                      <Sparkles className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-4 text-foreground">创作模式</p>
                      <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground/90">当前：{contentModeLabel}</p>
                    </div>
                    <svg
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                        contentModeExpanded && "rotate-180",
                      )}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {contentModeExpanded ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border/60 pt-2">
                      {contentModeOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className={cn(
                            "flex flex-col rounded-lg px-2.5 py-2 text-left transition-all",
                            contentMode === option.id
                              ? "bg-primary/[0.08] ring-1 ring-inset ring-primary/20"
                              : "hover:bg-muted/60",
                          )}
                          onClick={() => {
                            onContentModeChange(option.id)
                            closeAddMenu()
                          }}
                        >
                          <span className={cn(
                            "text-[12.5px] leading-4",
                            contentMode === option.id ? "font-semibold text-primary" : "font-medium text-foreground/90",
                          )}>
                            {option.label}
                          </span>
                          {option.hint ? (
                            <span className="mt-0.5 text-[10.5px] leading-3.5 text-muted-foreground/90">{option.hint}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showSkills && skills.length > 0 ? (
                <div>
                  <div className="mb-2 flex items-end justify-between px-0.5">
                    <div>
                      <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">内置技能</p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground/70">一键套用专家提示词，快速启动</p>
                    </div>
                  </div>
                  {skills.length > 4 ? (
                    <div className="relative mb-2 px-0.5">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={skillQuery}
                        onChange={(event) => setSkillQuery(event.target.value)}
                        placeholder="搜索技能…"
                        className="h-9 border border-border/70 bg-background/80 pl-9 text-[12.5px] shadow-none"
                        autoFocus
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2.5">
                    {skills.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-[12px] text-muted-foreground/80">当前智能体暂无内置技能</p>
                    ) : filteredSkills.map(({ group, items }) => (
                      <div key={group || "_default"} className="space-y-1.5">
                        {group ? (
                          <div className="flex items-center gap-2 px-0.5">
                            <span className="h-px flex-1 bg-border/60" />
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                              {group}
                            </p>
                            <span className="h-px flex-1 bg-border/60" />
                          </div>
                        ) : null}
                        <div className="space-y-1.5">
                          {items.map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              className="group flex w-full items-start gap-3 rounded-xl border border-transparent bg-card/40 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.04] hover:shadow-[0_4px_14px_-6px_rgba(209,74,51,0.18)]"
                              onClick={() => {
                                onUseSkill?.(skill)
                                closeAddMenu()
                              }}
                            >
                              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/12 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/15">
                                <svg viewBox="0 0 24 24" fill="none" className="size-4" xmlns="http://www.w3.org/2000/svg">
                                  <path
                                    d="M12 2.25c.5 2.4 2.35 4.25 4.75 4.75-2.4.5-4.25 2.35-4.75 4.75-.5-2.4-2.35-4.25-4.75-4.75 2.4-.5 4.25-2.35 4.75-4.75Z"
                                    fill="currentColor"
                                    opacity=".9"
                                  />
                                  <path
                                    d="M19.25 12.5c.25 1.2 1.18 2.12 2.37 2.37-1.2.25-2.12 1.18-2.37 2.37-.25-1.2-1.18-2.12-2.37-2.37 1.2-.25 2.12-1.18 2.37-2.37Z"
                                    fill="currentColor"
                                    opacity=".7"
                                  />
                                </svg>
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[13.5px] font-semibold leading-5 tracking-tight text-foreground">
                                    {skill.label}
                                  </p>
                                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-primary" />
                                </div>
                                {skill.description ? (
                                  <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground/90">
                                    {skill.description}
                                  </p>
                                ) : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {skills.length > 0 && filteredSkills.every(({ items }) => items.length === 0) ? (
                      <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-[12px] text-muted-foreground/80">没有找到匹配的技能</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 pb-2.5 pt-2">
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
                  "h-8.5 w-8.5 rounded-xl p-0 transition-all duration-150",
                  addMenuOpen
                    ? "bg-gradient-to-br from-primary/14 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/20 hover:bg-gradient-to-br hover:from-primary/18 hover:to-amber-500/12"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                onClick={() => setAddMenuOpen((open) => !open)}
                disabled={busy}
                title="添加图片、技能、模式…"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </Button>
            ) : null}
            {styleEnabled && capabilities.styleSample ? (
              <button
                type="button"
                onClick={onOpenStyleAssets}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/15 bg-gradient-to-r from-primary/[0.07] to-amber-500/[0.04] px-2.5 text-[11px] font-medium text-primary/90 transition-all hover:border-primary/25 hover:from-primary/[0.1] hover:text-primary"
                title="查看我的表达风格"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 2.25c.5 2.4 2.35 4.25 4.75 4.75-2.4.5-4.25 2.35-4.75 4.75-.5-2.4-2.35-4.25-4.75-4.75 2.4-.5 4.25-2.35 4.75-4.75Z"
                    fill="currentColor"
                  />
                </svg>
                我的风格 · 已启用
              </button>
            ) : null}
            {(isTranscribing || isRecording || isPlanMode) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/90">
                <span className={cn(
                  "size-1.5 rounded-full",
                  isRecording
                    ? "bg-red-500 animate-pulse"
                    : isTranscribing
                      ? "bg-amber-500 animate-pulse"
                      : "bg-violet-500",
                )} />
                {isTranscribing ? "语音转写中…" : isRecording ? "录音中" : "计划模式"}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8.5 w-8.5 rounded-xl p-0 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground"
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={busy && !isRecording}
              title={isRecording ? "停止录音" : "语音输入"}
            >
              {isRecording ? <Square className="h-[17px] w-[17px] text-red-500" /> : <Mic className="h-[18px] w-[18px]" strokeWidth={2.1} />}
            </Button>
            {canStop ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8.5 w-8.5 rounded-xl p-0 text-red-600 transition-all hover:bg-red-500/10 hover:text-red-600"
                onClick={onStop}
                title="停止生成"
              >
                <Square className="h-[17px] w-[17px]" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={onGenerate}
              disabled={!canSubmit}
              className={cn(
                "h-9.5 rounded-full transition-all duration-150",
                isPlanMode
                  ? "gap-2 px-5 shadow-[0_0_0_1px_rgba(209,74,51,0.2),0_6px_16px_-6px_rgba(209,74,51,0.45)]"
                  : "w-10 p-0 shadow-[0_0_0_1px_rgba(209,74,51,0.22),0_6px_14px_-4px_rgba(209,74,51,0.4)]",
                !canSubmit && "opacity-60",
              )}
              title={isPlanMode ? "开始规划" : primaryActionLabel}
            >
              {isGenerating ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : isPlanMode ? (
                <>
                  <ListChecks className="h-[17px] w-[17px]" strokeWidth={2.2} />
                  <span className="text-[13.5px] font-semibold leading-none tracking-tight">规划</span>
                </>
              ) : (
                <Send className="h-[18px] w-[18px]" strokeWidth={2.1} />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
