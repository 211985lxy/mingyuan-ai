"use client"

import type { RefObject } from "react"
import { ListChecks, Loader2, Mic, Plus, Send, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AimComposerMode } from "@/components/aim/aim-prompt-shared"
import { type AimAgentCapabilities } from "@/lib/aim/agent-capabilities"
import { cn } from "@/lib/utils"

/** 底部操作条（+按钮 / 我的风格 / 状态 pill / 语音 / 停止 / 发送）。
 *  拆分为 AimActionBarLeft + AimActionBarRight 两个子组件，
 *  确保单函数 ≤80 行（functionBaseline 护栏）。
 */
export function AimActionBar(props: {
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
  styleEnabled: boolean
  capabilities: AimAgentCapabilities
  onOpenStyleAssets?: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onStop?: () => void
  onGenerate: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onAddImages?: (files: FileList) => void
}) {
  const {
    busy, isRecording, isTranscribing, isPlanMode, isGenerating, canSubmit, canStop,
    primaryActionLabel, showAddMenu, addMenuOpen, onToggleAddMenu,
    styleEnabled, capabilities, onOpenStyleAssets,
    onStartRecording, onStopRecording, onStop, onGenerate,
    fileInputRef, onAddImages,
  } = props
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 pb-2.5 pt-2">
      <ActionBarLeft
        busy={busy}
        fileInputRef={fileInputRef}
        onAddImages={onAddImages}
        showAddMenu={showAddMenu}
        addMenuOpen={addMenuOpen}
        onToggleAddMenu={onToggleAddMenu}
        styleEnabled={styleEnabled}
        capabilities={capabilities}
        onOpenStyleAssets={onOpenStyleAssets}
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

function ActionBarLeft(props: {
  busy: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onAddImages?: (files: FileList) => void
  showAddMenu: boolean
  addMenuOpen: boolean
  onToggleAddMenu: () => void
  styleEnabled: boolean
  capabilities: AimAgentCapabilities
  onOpenStyleAssets?: () => void
  isTranscribing: boolean
  isRecording: boolean
  isPlanMode: boolean
}) {
  const {
    busy, fileInputRef, onAddImages, showAddMenu, addMenuOpen,
    onToggleAddMenu, styleEnabled, capabilities, onOpenStyleAssets,
    isTranscribing, isRecording, isPlanMode,
  } = props
  return (
    <div className="flex min-w-0 items-center gap-1">
      <HiddenImageInput
        fileInputRef={fileInputRef}
        onAddImages={onAddImages}
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
          onClick={onToggleAddMenu}
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
          <StyleSparkles />
          我的风格 · 已启用
        </button>
      ) : null}
      <StatusPill
        isTranscribing={isTranscribing}
        isRecording={isRecording}
        isPlanMode={isPlanMode}
      />
    </div>
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
