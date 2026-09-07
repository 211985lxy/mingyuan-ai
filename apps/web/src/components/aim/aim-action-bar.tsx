"use client"

import { useRef, type RefObject } from "react"
import { ExternalLink, ListChecks, Loader2, Mic, Paperclip, Plus, Send, Sparkles, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AimComposerMode } from "@/components/aim/aim-prompt-shared"
import { type AimAgentCapabilities } from "@/lib/aim/agent-capabilities"
import { splitPastedFiles } from "@/lib/aim/file-attachments"
import { cn } from "@/lib/utils"

/** 底部操作条（+按钮 / 我的风格 / 计划开关 / 语音 / 停止 / 发送）；拆分左右子组件守 ≤80 行护栏。 */
interface AimActionBarProps {
  busy: boolean
  isRecording: boolean
  isTranscribing: boolean
  isPlanMode: boolean
  isGenerating: boolean
  canSubmit: boolean
  canStop: boolean
  primaryActionLabel: string
  showAddMenu: boolean
  addMenuOpen: boolean
  onToggleAddMenu: () => void
  showSkillQuick?: boolean
  skillQuickOpen?: boolean
  onToggleSkillQuick?: () => void
  styleEnabled: boolean
  styleAvailable: boolean
  capabilities: AimAgentCapabilities
  /** 显性计划模式开关（先确认再生成）；showPlanModeControl && canUsePlanMode 时为 true */
  showPlanModeToggle?: boolean
  planModeActive?: boolean
  onTogglePlanMode?: () => void
  onToggleStyleEnabled?: () => void
  onOpenStyleAssets?: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onStop?: () => void
  onGenerate: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onAddImages?: (files: FileList) => void
  onAddFiles?: (files: File[]) => void
}

export function AimActionBar(props: AimActionBarProps) {
  const {
    busy, isRecording, isTranscribing, isPlanMode, isGenerating, canSubmit, canStop,
    primaryActionLabel, showAddMenu, addMenuOpen, onToggleAddMenu,
    showSkillQuick, skillQuickOpen, onToggleSkillQuick,
    styleEnabled, styleAvailable, capabilities,
    showPlanModeToggle, planModeActive, onTogglePlanMode,
    onToggleStyleEnabled, onOpenStyleAssets,
    onStartRecording, onStopRecording, onStop, onGenerate,
    fileInputRef, onAddImages, onAddFiles,
  } = props
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 pb-2.5 pt-2">
      <ActionBarLeft
        busy={busy}
        fileInputRef={fileInputRef}
        onAddImages={onAddImages}
        onAddFiles={onAddFiles}
        showAddMenu={showAddMenu}
        addMenuOpen={addMenuOpen}
        onToggleAddMenu={onToggleAddMenu}
        showSkillQuick={showSkillQuick}
        skillQuickOpen={skillQuickOpen}
        onToggleSkillQuick={onToggleSkillQuick}
        styleEnabled={styleEnabled}
        styleAvailable={styleAvailable}
        capabilities={capabilities}
        onToggleStyleEnabled={onToggleStyleEnabled}
        onOpenStyleAssets={onOpenStyleAssets}
        showPlanModeToggle={showPlanModeToggle}
        planModeActive={planModeActive}
        onTogglePlanMode={onTogglePlanMode}
        isTranscribing={isTranscribing}
        isRecording={isRecording}
        isPlanMode={isPlanMode}
      />
      <ActionBarRight
        busy={busy}
        isRecording={isRecording}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        canStop={canStop}
        onStop={onStop}
        onGenerate={onGenerate}
        canSubmit={canSubmit}
        isPlanMode={isPlanMode}
        isGenerating={isGenerating}
        primaryActionLabel={primaryActionLabel}
      />
    </div>
  )
}

interface ActionBarLeftProps {
  busy: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onAddImages?: (files: FileList) => void
  onAddFiles?: (files: File[]) => void
  showAddMenu: boolean
  addMenuOpen: boolean
  onToggleAddMenu: () => void
  showSkillQuick?: boolean
  skillQuickOpen?: boolean
  onToggleSkillQuick?: () => void
  styleEnabled: boolean
  styleAvailable: boolean
  capabilities: AimAgentCapabilities
  showPlanModeToggle?: boolean
  planModeActive?: boolean
  onTogglePlanMode?: () => void
  onToggleStyleEnabled?: () => void
  onOpenStyleAssets?: () => void
  isTranscribing: boolean
  isRecording: boolean
  isPlanMode: boolean
}

function ActionBarLeft(props: ActionBarLeftProps) {
  const {
    busy, fileInputRef, onAddImages, onAddFiles, showAddMenu, addMenuOpen,
    onToggleAddMenu, showSkillQuick, skillQuickOpen, onToggleSkillQuick,
    styleEnabled, styleAvailable, capabilities, onToggleStyleEnabled, onOpenStyleAssets,
    showPlanModeToggle, planModeActive, onTogglePlanMode,
    isTranscribing, isRecording, isPlanMode,
  } = props
  return (
    <div className="flex min-w-0 items-center gap-1">
      <HiddenImageInput
        fileInputRef={fileInputRef}
        onAddImages={onAddImages}
      />
      {onAddFiles ? <AttachFileButton busy={busy} onAddFiles={onAddFiles} onAddImages={onAddImages} /> : null}
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
          onClick={onToggleAddMenu}
          disabled={busy}
          title="添加图片、技能、模式…"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </Button>
      ) : null}
      {showSkillQuick ? (
        <SkillQuickButton
          open={Boolean(skillQuickOpen)}
          onToggle={onToggleSkillQuick}
          disabled={busy}
        />
      ) : null}
      <StylePillGroup
        styleEnabled={styleEnabled}
        styleAvailable={styleAvailable}
        capabilities={capabilities}
        onToggleStyleEnabled={onToggleStyleEnabled}
        onOpenStyleAssets={onOpenStyleAssets}
      />
      {showPlanModeToggle ? (
        <PlanModeToggle active={Boolean(planModeActive)} onToggle={onTogglePlanMode} />
      ) : null}
      <StatusPill
        isTranscribing={isTranscribing}
        isRecording={isRecording}
        isPlanMode={isPlanMode}
      />
    </div>
  )
}

/** 「我的风格」开关 + 档案入口（右半圆按钮仅在可管理档案时出现）；不满足能力时不渲染。 */
function StylePillGroup(props: {
  styleEnabled: boolean
  styleAvailable: boolean
  capabilities: AimAgentCapabilities
  onToggleStyleEnabled?: () => void
  onOpenStyleAssets?: () => void
}) {
  const { styleEnabled, styleAvailable, capabilities, onToggleStyleEnabled, onOpenStyleAssets } = props
  if (!styleAvailable || !capabilities.styleSample) return null
  return (
    <div className="group inline-flex items-center">
      <button
        type="button"
        onClick={onToggleStyleEnabled}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-l-full border px-2.5 text-[11px] font-medium transition-all",
          styleEnabled
            ? "border-primary/15 bg-gradient-to-r from-primary/[0.07] to-amber-500/[0.04] text-primary/90 hover:border-primary/25 hover:from-primary/[0.1] hover:text-primary"
            : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/20 hover:text-foreground",
        )}
        title={styleEnabled ? "点击关闭：本次生成不再应用我的表达风格" : "点击开启：生成内容将沿用你的表达风格"}
      >
        <StyleSparkles />
        {styleEnabled ? "我的风格 · 已启用" : "我的风格 · 未启用"}
      </button>
      {onOpenStyleAssets ? (
        <button
          type="button"
          onClick={onOpenStyleAssets}
          className={cn(
            "inline-flex h-8 items-center rounded-r-full border border-l-0 px-1.5 transition-all",
            styleEnabled
              ? "border-primary/15 bg-gradient-to-r from-amber-500/[0.04] to-primary/[0.05] text-primary/70 hover:text-primary"
              : "border-border/60 bg-card/40 text-muted-foreground/70 hover:text-foreground",
          )}
          title="查看或管理风格档案"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}

/** 显性「先确认再生成」开关：样式对齐旁边「我的风格」pill，激活态用 violet 呼应计划模式。 */
function PlanModeToggle(props: {
  active: boolean
  onToggle?: () => void
}) {
  const { active, onToggle } = props
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-all",
        active
          ? "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400"
          : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/20 hover:text-foreground",
      )}
      title={active ? "点击关闭：直接生成，不再先出任务单" : "点击开启：先出任务单，你确认后再生成"}
    >
      <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
      {active ? "先确认 · 已启用" : "先确认再生成"}
    </button>
  )
}

function StatusPill(props: {
  isTranscribing: boolean
  isRecording: boolean
  isPlanMode: boolean
}) {
  const { isTranscribing, isRecording, isPlanMode } = props
  const active = isTranscribing || isRecording || isPlanMode
  if (!active) return null
  const label = isTranscribing
    ? "语音转写中…"
    : isRecording
      ? "录音中"
      : "计划模式"
  const dotColor = isRecording
    ? "bg-red-500 animate-pulse"
    : isTranscribing
      ? "bg-amber-500 animate-pulse"
      : "bg-violet-500"
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/90">
      <span className={cn("size-1.5 rounded-full", dotColor)} />
      {label}
    </span>
  )
}

function ActionBarRight(props: {
  busy: boolean
  isRecording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  canStop: boolean
  onStop?: () => void
  onGenerate: () => void
  canSubmit: boolean
  isPlanMode: boolean
  isGenerating: boolean
  primaryActionLabel: string
}) {
  const {
    busy, isRecording, onStartRecording, onStopRecording,
    canStop, onStop, onGenerate, canSubmit,
    isPlanMode, isGenerating, primaryActionLabel,
  } = props
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <MicButton
        busy={busy}
        isRecording={isRecording}
        onStart={onStartRecording}
        onStop={onStopRecording}
      />
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
      <PrimaryButton
        onGenerate={onGenerate}
        canSubmit={canSubmit}
        isPlanMode={isPlanMode}
        isGenerating={isGenerating}
        primaryActionLabel={primaryActionLabel}
      />
    </div>
  )
}

function MicButton(props: {
  busy: boolean
  isRecording: boolean
  onStart: () => void
  onStop: () => void
}) {
  const { busy, isRecording, onStart, onStop } = props
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8.5 w-8.5 rounded-xl p-0 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground"
      onClick={isRecording ? onStop : onStart}
      disabled={busy && !isRecording}
      title={isRecording ? "停止录音" : "语音输入"}
    >
      {isRecording ? (
        <Square className="h-[17px] w-[17px] text-red-500" />
      ) : (
        <Mic className="h-[18px] w-[18px]" strokeWidth={2.1} />
      )}
    </Button>
  )
}

function PrimaryButton(props: {
  onGenerate: () => void
  canSubmit: boolean
  isPlanMode: boolean
  isGenerating: boolean
  primaryActionLabel: string
}) {
  const { onGenerate, canSubmit, isPlanMode, isGenerating, primaryActionLabel } = props
  return (
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
      {/* 生成中但已输入新内容 → 显示发送（点击接替当前请求）；仅在不可发送时显示转圈 */}
      {isGenerating && !canSubmit ? (
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
  )
}

function StyleSparkles() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2.25c.5 2.4 2.35 4.25 4.75 4.75-2.4.5-4.25 2.35-4.75 4.75-.5-2.4-2.35-4.25-4.75-4.75 2.4-.5 4.25-2.35 4.75-4.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

function HiddenImageInput(props: {
  fileInputRef: RefObject<HTMLInputElement | null>
  onAddImages?: (files: FileList) => void
}) {
  const { fileInputRef, onAddImages } = props
  return (
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
  )
}

/** 「回形针」通用文件入口：WebKit 内嵌浏览器粘贴/拖拽受限时的可靠通道。 */
function AttachFileButton(props: {
  busy: boolean
  onAddFiles: (files: File[]) => void
  onAddImages?: (files: FileList) => void
}) {
  const { busy, onAddFiles, onAddImages } = props
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length) {
            const { images, documents } = splitPastedFiles(files)
            if (documents.length) onAddFiles(documents)
            if (images.length && onAddImages) {
              const dt = new DataTransfer()
              images.forEach((image) => dt.items.add(image))
              onAddImages(dt.files)
            }
          }
          event.target.value = ""
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8.5 w-8.5 rounded-xl p-0 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        title="添加文件：图片（PNG/JPG…）直接看图；文档文本（PDF/Word/Excel/PPT/TXT/MD/CSV…及任意文本类）自动读取内容"
      >
        <Paperclip className="h-[17px] w-[17px]" strokeWidth={2.1} />
      </Button>
    </>
  )
}

/** 左下角常驻「技能」速选入口：点击弹出 skill 速选面板，与 + 菜单互斥。 */
function SkillQuickButton(props: {
  open: boolean
  onToggle?: () => void
  disabled?: boolean
}) {
  const { open, onToggle, disabled } = props
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={open}
      title="选择技能"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-all duration-150",
        open
          ? "bg-gradient-to-br from-primary/14 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/20"
          : "border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/25 hover:text-foreground",
      )}
    >
      <Sparkles className="h-[15px] w-[15px]" strokeWidth={2.1} />
      <span className="leading-none">技能</span>
    </button>
  )
}
