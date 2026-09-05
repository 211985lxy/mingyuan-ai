"use client"

import type { MutableRefObject, ReactNode } from "react"
import { FileText, Loader2 } from "lucide-react"

import { AimActionBar } from "@/components/aim/aim-action-bar"
import { AimAddMenuPanel } from "@/components/aim/aim-add-menu-panel"
import { AimSkillQuickPopover } from "@/components/aim/aim-skill-quick-popover"
import { AimPastedCopyAttachmentBar } from "@/components/aim/aim-pasted-copy-attachment"
import type { AimComposerMode } from "@/components/aim/aim-prompt-shared"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { type AimAgentCapabilities } from "@/lib/aim/agent-capabilities"
import { type CopyStudioModule } from "@/lib/copy-studio"
import {
  type PastedCopyAttachment,
  type PasteUsage,
} from "@/lib/aim/paste-copy-attachment"
import { formatAimFileSize } from "@/lib/aim/file-attachments"
import { cn } from "@/lib/utils"

import type { SkillGroup } from "@/components/aim/aim-add-menu-panel-sections"

/* ------------------- Shell & Card ------------------- */

export function ComposerCardShell(props: {
  rootRef: MutableRefObject<HTMLDivElement | null>
  pastedCopy: PastedCopyAttachment | null
  pasteEnabled: boolean
  busy: boolean
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  applyUsage: (usage: PasteUsage) => void
  allowedUsages: PasteUsage[]
  autoUsageLabel: string | undefined
  children: ReactNode
}) {
  const {
    rootRef, pastedCopy, pasteEnabled, busy,
    onPastedCopyChange, applyUsage, allowedUsages, autoUsageLabel, children,
  } = props
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
        {children}
      </div>
    </div>
  )
}

export function ComposerTextarea(props: {
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (v: string) => void
  handlePaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
  handleDroppedFiles?: (files: File[]) => void
  canSubmit: boolean
  onGenerate: () => void
  placeholder: string
  busy: boolean
}) {
  const {
    textareaRef, value, onChange, handlePaste, handleDroppedFiles,
    canSubmit, onGenerate, placeholder, busy,
  } = props
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onPaste={(event) => handlePaste?.(event)}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault()
      }}
      onDrop={(event) => {
        const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
        if (droppedFiles.length === 0) return
        event.preventDefault()
        handleDroppedFiles?.(droppedFiles)
      }}
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
  )
}

export function ImageAttachments(props: {
  imageAttachments: Array<{ id: string; name: string; previewUrl: string }>
  onRemoveImage?: (id: string) => void
  busy: boolean
}) {
  const { imageAttachments, onRemoveImage, busy } = props
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2">
      {imageAttachments.map((image) => (
        <div
          key={image.id}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted"
        >
          <img
            src={image.previewUrl}
            alt={image.name}
            className="h-full w-full object-cover"
          />
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
  )
}

export function FileAttachmentChips(props: {
  fileAttachments: Array<{ id: string; name: string; size: number; status: "uploading" | "ready" }>
  onRemoveFile?: (id: string) => void
  busy: boolean
}) {
  const { fileAttachments, onRemoveFile, busy } = props
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2">
      {fileAttachments.map((file) => (
        <div
          key={file.id}
          className="flex h-14 shrink-0 items-center gap-2 rounded-xl bg-muted px-3"
        >
          {file.status === "uploading" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="解析中" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          )}
          <span className="flex max-w-40 flex-col">
            <span className="truncate text-xs font-medium text-foreground" title={file.name}>
              {file.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {file.status === "uploading" ? "解析中…" : formatAimFileSize(file.size)}
            </span>
          </span>
          <button
            type="button"
            className="rounded-full bg-background/90 p-0.5 text-foreground shadow"
            onClick={() => onRemoveFile?.(file.id)}
            disabled={busy}
            title="移除文件"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** 输入框内的附件区：图片缩略图 + 文件 chip 两种通道并列。 */
export function ComposerAttachmentRows(props: {
  imageAttachments: Array<{ id: string; name: string; previewUrl: string }>
  fileAttachments: Array<{ id: string; name: string; size: number; status: "uploading" | "ready" }>
  onRemoveImage?: (id: string) => void
  onRemoveFile?: (id: string) => void
  busy: boolean
}) {
  const { imageAttachments, fileAttachments, onRemoveImage, onRemoveFile, busy } = props
  return (
    <>
      {imageAttachments.length > 0 ? (
        <ImageAttachments imageAttachments={imageAttachments} onRemoveImage={onRemoveImage} busy={busy} />
      ) : null}
      {fileAttachments.length > 0 ? (
        <FileAttachmentChips fileAttachments={fileAttachments} onRemoveFile={onRemoveFile} busy={busy} />
      ) : null}
    </>
  )
}

export interface ComposerPanelsAndBarProps {
  addMenuOpen: boolean
  setAddMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void
  toggleAddMenu: () => void
  showSkillQuick: boolean
  skillQuickOpen: boolean
  toggleSkillQuick: () => void
  busy: boolean
  isPlanMode: boolean
  canUsePlanMode: boolean
  composerMode: AimComposerMode
  onComposerModeChange?: (mode: AimComposerMode) => void
  showPlanModeControl: boolean
  onAddImages?: (files: FileList) => void
  showContentModeControl: boolean
  contentMode: CopyStudioModule | undefined
  contentModeLabel: string
  contentModeExpanded: boolean
  setContentModeExpanded: (v: boolean | ((p: boolean) => boolean)) => void
  contentModeOptions: Array<{ id: CopyStudioModule | undefined; label: string; hint: string }>
  onContentModeChange?: (value: CopyStudioModule | undefined) => void
  showSkills: boolean
  skills: AimWorkbenchSkill[]
  skillQuery: string
  setSkillQuery: (v: string) => void
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  closeAddMenu: () => void
  onAddSkill?: () => void
  onEditSkill?: (skill: AimWorkbenchSkill) => void
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  isRecording: boolean
  isTranscribing: boolean
  isGenerating: boolean
  canSubmit: boolean
  canStop: boolean
  primaryActionLabel: string
  showAddMenu: boolean
  styleEnabled: boolean
  styleAvailable: boolean
  capabilities: AimAgentCapabilities
  onToggleStyleEnabled?: () => void
  onOpenStyleAssets?: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onStop?: () => void
  onGenerate: () => void
}

export function ComposerPanelsAndBar(props: ComposerPanelsAndBarProps) {
  const {
    addMenuOpen, toggleAddMenu,
    showSkillQuick, skillQuickOpen, toggleSkillQuick,
    busy, isPlanMode, canUsePlanMode, composerMode,
    onComposerModeChange, showPlanModeControl, onAddImages,
    showContentModeControl, contentMode, contentModeLabel,
    contentModeExpanded, setContentModeExpanded, contentModeOptions,
    onContentModeChange, showSkills, skills, skillQuery, setSkillQuery,
    filteredSkills, onUseSkill, closeAddMenu, onAddSkill, onEditSkill, fileInputRef,
    isRecording, isTranscribing, isGenerating, canSubmit, canStop,
    primaryActionLabel, showAddMenu, styleEnabled, styleAvailable, capabilities,
    onToggleStyleEnabled, onOpenStyleAssets, onStartRecording, onStopRecording, onStop, onGenerate,
  } = props
  return (
    <>
      {addMenuOpen ? (
        <AimAddMenuPanel
          busy={busy}
          isPlanMode={isPlanMode}
          canUsePlanMode={canUsePlanMode}
          composerMode={composerMode}
          onComposerModeChange={onComposerModeChange}
          showPlanModeControl={showPlanModeControl}
          onAddImages={Boolean(onAddImages)}
          showContentModeControl={showContentModeControl}
          contentMode={contentMode}
          contentModeLabel={contentModeLabel}
          contentModeExpanded={contentModeExpanded}
          setContentModeExpanded={setContentModeExpanded}
          contentModeOptions={contentModeOptions}
          onContentModeChange={onContentModeChange}
          showSkills={showSkills}
          skills={skills}
          skillQuery={skillQuery}
          setSkillQuery={setSkillQuery}
          filteredSkills={filteredSkills}
          onUseSkill={onUseSkill}
          close={closeAddMenu}
          fileInputRef={fileInputRef}
        />
      ) : null}
      {showSkillQuick && skillQuickOpen ? (
        <AimSkillQuickPopover
          skills={skills}
          onUseSkill={onUseSkill}
          onAddSkill={onAddSkill}
          onEditSkill={onEditSkill}
          close={closeAddMenu}
        />
      ) : null}
      <AimActionBar
        busy={busy}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isPlanMode={isPlanMode}
        isGenerating={isGenerating}
        canSubmit={canSubmit}
        canStop={canStop}
        primaryActionLabel={primaryActionLabel}
        showAddMenu={showAddMenu}
        addMenuOpen={addMenuOpen}
        onToggleAddMenu={toggleAddMenu}
        showSkillQuick={showSkillQuick}
        skillQuickOpen={skillQuickOpen}
        onToggleSkillQuick={toggleSkillQuick}
        styleEnabled={styleEnabled}
        styleAvailable={styleAvailable}
        capabilities={capabilities}
        onToggleStyleEnabled={onToggleStyleEnabled}
        onOpenStyleAssets={onOpenStyleAssets}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        onStop={onStop}
        onGenerate={onGenerate}
        fileInputRef={fileInputRef}
        onAddImages={onAddImages}
      />
    </>
  )
}
