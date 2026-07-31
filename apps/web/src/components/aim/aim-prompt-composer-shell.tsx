"use client"

import type { MutableRefObject, ReactNode } from "react"

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
  pasteEnabled: boolean
  canSubmit: boolean
  onGenerate: () => void
  placeholder: string
  busy: boolean
}) {
  const {
    textareaRef, value, onChange, handlePaste, pasteEnabled,
    canSubmit, onGenerate, placeholder, busy,
  } = props
  return (
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
  capabilities: AimAgentCapabilities
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
    primaryActionLabel, showAddMenu, styleEnabled, capabilities,
    onOpenStyleAssets, onStartRecording, onStopRecording, onStop, onGenerate,
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
        capabilities={capabilities}
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
