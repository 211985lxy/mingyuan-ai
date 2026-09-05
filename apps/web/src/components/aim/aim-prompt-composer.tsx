"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  buildFilteredSkills,
  useContentModeOptions,
  type AimComposerMode,
} from "@/components/aim/aim-prompt-shared"
import {
  ComposerAttachmentRows,
  ComposerCardShell,
  ComposerPanelsAndBar,
  ComposerTextarea,
} from "@/components/aim/aim-prompt-composer-shell"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import {
  getAimAgentCapabilities,
  type AimAgentCapabilities,
} from "@/lib/aim/agent-capabilities"
import { COPY_STUDIO_MODULE_LABELS, type CopyStudioModule } from "@/lib/copy-studio"
import {
  canSubmitWithPasteAttachment,
  type PastedCopyAttachment,
  type PasteUsage,
} from "@/lib/aim/paste-copy-attachment"
import { collectPasteFiles, splitPastedFiles } from "@/lib/aim/file-attachments"
import type { AimFileAttachment } from "@/lib/aim/workbench-types"
import { useAimPasteCopyAttachment } from "@/features/aim/hooks/use-aim-paste-copy-attachment"

export type { AimComposerMode } from "@/components/aim/aim-prompt-shared"

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
  onAddSkill?: () => void
  onEditSkill?: (skill: AimWorkbenchSkill) => void
  imageAttachments?: Array<{ id: string; name: string; previewUrl: string }>
  onAddImages?: (files: FileList | File[]) => void
  onRemoveImage?: (id: string) => void
  fileAttachments?: AimFileAttachment[]
  onAddFiles?: (files: File[]) => void
  onRemoveFile?: (id: string) => void
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
  styleAvailable?: boolean
  onToggleStyleEnabled?: () => void
  onOpenStyleAssets?: () => void
  capabilities?: AimAgentCapabilities
}

/** 悬浮输入卡片：文本 / 图片 / 长文附件 / 发送。
 *  Render 子组件存放在 aim-prompt-composer-shell.tsx；
 *  AddMenu 子组件存放在 aim-add-menu-panel.tsx + aim-add-menu-panel-sections.tsx。
 */
export function AimPromptComposer(props: AimPromptComposerProps) {
  const all = useComposerAllState(props)
  const viewProps: AimPromptComposerViewProps = {
    ...props,
    pastedCopy: props.pastedCopy ?? null,
    imageAttachments: props.imageAttachments ?? [],
    fileAttachments: props.fileAttachments ?? [],
    busy: props.busy ?? false,
    isRecording: props.isRecording ?? false,
    isTranscribing: props.isTranscribing ?? false,
    isGenerating: props.isGenerating ?? false,
    canUsePlanMode: props.canUsePlanMode ?? false,
    showSkills: props.showSkills ?? false,
    skills: props.skills ?? [],
    composerMode: props.composerMode ?? "direct",
    styleEnabled: props.styleEnabled ?? false,
    styleAvailable: props.styleAvailable ?? false,
    ...all.state,
    ...all.local,
    ...all.extra,
  }
  return <AimPromptComposerView {...viewProps} />
}

/* 把 state hooks 打包到一起，避免 AimPromptComposer 主函数撑破 80 行。 */
function useComposerAllState(props: AimPromptComposerProps) {
  const {
    value, busy, isRecording, canGenerate, onStop,
    composerMode = "direct", pastedCopy = null, onPastedCopyChange, onStyleSampleRequest,
    imageAttachments = [], fileAttachments = [], capabilities: capabilitiesProp, isPlanSessionActive = false,
    onComposerModeChange, showContentMode = false, showSkills = false, onAddImages, onAddFiles,
    onAddSkill, onEditSkill,
  } = props
  const state = useComposerDerivedState({
    value, busy: busy || false, isRecording: isRecording || false,
    isTranscribing: props.isTranscribing || false,
    canGenerate: canGenerate || false, onStop,
    composerMode, pastedCopy, onPastedCopyChange, onStyleSampleRequest,
    imageAttachments, fileAttachments, capabilitiesProp, isPlanSessionActive,
    onComposerModeChange, showContentMode, showSkills, onAddImages, onAddFiles,
  })
  const { capabilities, isPlanMode, applyUsage, handlePaste, handleDroppedFiles, allowedUsages, pasteEnabled,
    canSubmit, canStop, showContentModeControl, showPlanModeControl, showAddMenu, showSkillQuick, autoUsageLabel } = state
  const local = useComposerLocalState({ value, skills: props.skills || [] })
  const contentModeLabel =
    props.contentMode === undefined ? "智能选择" : COPY_STUDIO_MODULE_LABELS[props.contentMode]
  const contentModeOptions = useContentModeOptions()
  return {
    state: { capabilities, isPlanMode, applyUsage, handlePaste, handleDroppedFiles, allowedUsages, pasteEnabled,
      canSubmit, canStop, showContentModeControl, showPlanModeControl, showAddMenu, showSkillQuick, autoUsageLabel },
    local,
    extra: { contentModeLabel, contentModeOptions },
  }
}

/* ------------------- 视图：把大段 JSX 从主函数拆走，保证主函数 ≤80 行 ------------------- */

interface AimPromptComposerViewProps {
  rootRef: React.MutableRefObject<HTMLDivElement | null>
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>
  pastedCopy: PastedCopyAttachment | null
  pasteEnabled: boolean
  busy: boolean
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  applyUsage: (usage: PasteUsage) => void
  allowedUsages: PasteUsage[]
  autoUsageLabel: string | undefined
  value: string
  onChange: (v: string) => void
  handlePaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
  handleDroppedFiles?: (files: File[]) => void
  canSubmit: boolean
  onGenerate: () => void
  placeholder: string
  imageAttachments: Array<{ id: string; name: string; previewUrl: string }>
  fileAttachments: AimFileAttachment[]
  onAddFiles?: (files: File[]) => void
  onRemoveImage?: (id: string) => void
  onRemoveFile?: (id: string) => void
  addMenuOpen: boolean
  setAddMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void
  toggleAddMenu: () => void
  isPlanMode: boolean
  canUsePlanMode: boolean
  composerMode: AimComposerMode
  onComposerModeChange?: (mode: AimComposerMode) => void
  showPlanModeControl: boolean
  onAddImages?: (files: FileList) => void
  showContentModeControl: boolean
  contentMode?: CopyStudioModule
  contentModeLabel: string
  contentModeExpanded: boolean
  setContentModeExpanded: (v: boolean | ((p: boolean) => boolean)) => void
  contentModeOptions: Array<{ id: CopyStudioModule | undefined; label: string; hint: string }>
  onContentModeChange?: (value: CopyStudioModule | undefined) => void
  showSkills: boolean
  skills: AimWorkbenchSkill[]
  skillQuery: string
  setSkillQuery: (v: string) => void
  filteredSkills: Array<{ group: string; items: AimWorkbenchSkill[] }>
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  closeAddMenu: () => void
  onAddSkill?: () => void
  onEditSkill?: (skill: AimWorkbenchSkill) => void
  showSkillQuick: boolean
  skillQuickOpen: boolean
  toggleSkillQuick: () => void
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  isRecording: boolean
  isTranscribing: boolean
  isGenerating: boolean
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
}

function AimPromptComposerView(p: AimPromptComposerViewProps) {
  return (
    <ComposerCardShell
      rootRef={p.rootRef}
      pastedCopy={p.pastedCopy}
      pasteEnabled={p.pasteEnabled}
      busy={p.busy}
      onPastedCopyChange={p.onPastedCopyChange}
      applyUsage={p.applyUsage}
      allowedUsages={p.allowedUsages}
      autoUsageLabel={p.autoUsageLabel}
      onFileDrop={p.handleDroppedFiles}
    >
      <ComposerTextarea
        textareaRef={p.textareaRef}
        value={p.value}
        onChange={p.onChange}
        handlePaste={p.handlePaste}
        handleDroppedFiles={p.handleDroppedFiles}
        canSubmit={p.canSubmit}
        onGenerate={p.onGenerate}
        placeholder={p.placeholder}
        busy={p.busy}
      />
      <ComposerAttachmentRows
        imageAttachments={p.imageAttachments}
        fileAttachments={p.fileAttachments}
        onRemoveImage={p.onRemoveImage}
        onRemoveFile={p.onRemoveFile}
        busy={p.busy}
      />
      <ComposerPanelsAndBar
        addMenuOpen={p.addMenuOpen}
        setAddMenuOpen={p.setAddMenuOpen}
        toggleAddMenu={p.toggleAddMenu}
        showSkillQuick={p.showSkillQuick}
        skillQuickOpen={p.skillQuickOpen}
        toggleSkillQuick={p.toggleSkillQuick}
        onAddSkill={p.onAddSkill}
        onEditSkill={p.onEditSkill}
        busy={p.busy}
        isPlanMode={p.isPlanMode}
        canUsePlanMode={p.canUsePlanMode}
        composerMode={p.composerMode}
        onComposerModeChange={p.onComposerModeChange}
        showPlanModeControl={p.showPlanModeControl}
        onAddImages={p.onAddImages}
        onAddFiles={p.onAddFiles}
        showContentModeControl={p.showContentModeControl}
        contentMode={p.contentMode}
        contentModeLabel={p.contentModeLabel}
        contentModeExpanded={p.contentModeExpanded}
        setContentModeExpanded={p.setContentModeExpanded}
        contentModeOptions={p.contentModeOptions}
        onContentModeChange={p.onContentModeChange}
        showSkills={p.showSkills}
        skills={p.skills}
        skillQuery={p.skillQuery}
        setSkillQuery={p.setSkillQuery}
        filteredSkills={p.filteredSkills}
        onUseSkill={p.onUseSkill}
        closeAddMenu={p.closeAddMenu}
        fileInputRef={p.fileInputRef}
        isRecording={p.isRecording}
        isTranscribing={p.isTranscribing}
        isGenerating={p.isGenerating}
        canSubmit={p.canSubmit}
        canStop={p.canStop}
        primaryActionLabel={p.primaryActionLabel}
        showAddMenu={p.showAddMenu}
        styleEnabled={p.styleEnabled}
        styleAvailable={p.styleAvailable}
        capabilities={p.capabilities}
        onToggleStyleEnabled={p.onToggleStyleEnabled}
        onOpenStyleAssets={p.onOpenStyleAssets}
        onStartRecording={p.onStartRecording}
        onStopRecording={p.onStopRecording}
        onStop={p.onStop}
        onGenerate={p.onGenerate}
      />
    </ComposerCardShell>
  )
}

/* ------------------- hooks ------------------- */

interface UseComposerDerivedStateInput {
  value: string
  busy: boolean
  isRecording: boolean
  isTranscribing: boolean
  canGenerate: boolean
  onStop?: () => void
  composerMode: AimComposerMode
  pastedCopy: PastedCopyAttachment | null
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  onStyleSampleRequest?: (attachment: PastedCopyAttachment) => void
  imageAttachments: Array<unknown>
  fileAttachments: AimFileAttachment[]
  capabilitiesProp?: AimAgentCapabilities
  isPlanSessionActive: boolean
  onComposerModeChange?: (mode: AimComposerMode) => void
  showContentMode: boolean
  showSkills: boolean
  onAddImages?: (files: FileList | File[]) => void
  onAddFiles?: (files: File[]) => void
}

function useComposerDerivedState(input: UseComposerDerivedStateInput) {
  const {
    value, busy, isRecording, isTranscribing, canGenerate, onStop,
    composerMode, pastedCopy, onPastedCopyChange, onStyleSampleRequest,
    imageAttachments, fileAttachments, capabilitiesProp, isPlanSessionActive,
    onComposerModeChange, showContentMode, showSkills, onAddImages, onAddFiles,
  } = input
  const capabilities = capabilitiesProp ?? getAimAgentCapabilities("content_producer")
  const isPlanMode = composerMode === "plan"
  const { applyUsage, handlePaste: handleCopyPaste, allowedUsages, pasteEnabled } = useAimPasteCopyAttachment({
    value,
    pastedCopy,
    onPastedCopyChange: capabilities.pasteMode === "plain" ? undefined : onPastedCopyChange,
    onStyleSampleRequest: capabilities.styleSample ? onStyleSampleRequest : undefined,
    imageCount: imageAttachments.length,
    capabilities,
  })
  // 粘贴/拖入的文件优先按附件处理（图片走图片通道，其余走文件解析）；
  // 剪贴板没有文件时再交给长文案粘贴捕获，两条通道互不抢事件。
  const routeClipboardFiles = useCallback((files: File[]) => {
    const { images, documents } = splitPastedFiles(files)
    if (images.length) onAddImages?.(images)
    if (documents.length) onAddFiles?.(documents)
  }, [onAddImages, onAddFiles])
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // files 为空时补读 items 里的图片：覆盖「截图后直接粘贴」的场景
    const clipboardFiles = collectPasteFiles(event.clipboardData)
    if (clipboardFiles.length > 0 && (onAddImages || onAddFiles)) {
      event.preventDefault()
      routeClipboardFiles(clipboardFiles)
      return
    }
    handleCopyPaste(event)
  }, [handleCopyPaste, onAddFiles, onAddImages, routeClipboardFiles])
  const handleDroppedFiles = useCallback((files: File[]) => {
    if (files.length === 0 || (!onAddImages && !onAddFiles)) return
    routeClipboardFiles(files)
  }, [onAddFiles, onAddImages, routeClipboardFiles])
  const effectivePasteUsage = pastedCopy?.usage
    ?? (allowedUsages.length === 1 ? allowedUsages[0] : undefined)
  const pasteReadyForSend = canSubmitWithPasteAttachment({
    text: value,
    attachment: pastedCopy
      ? { ...pastedCopy, usage: effectivePasteUsage }
      : null,
    hasImages: imageAttachments.length > 0,
    hasFiles: fileAttachments.length > 0,
  })
  // 生成/质检进行中不再禁发：直接发送会自动接替当前请求（beginExclusiveRequest 中止旧请求）；
  // 仅录音/转写这类语音流和计划模式仍要求空闲。
  const canSend = !isRecording && !isTranscribing && pasteReadyForSend
  const canPlan =
    !busy && !isRecording && value.trim().length > 0 &&
    (!pastedCopy || Boolean(effectivePasteUsage))
  const canSubmit =
    (isPlanMode ? canPlan : canSend) &&
    canGenerate &&
    (!pastedCopy || Boolean(effectivePasteUsage && effectivePasteUsage !== "style_sample"))
  const canStop = busy && !isRecording && Boolean(onStop)
  const showContentModeControl = showContentMode && capabilities.contentModeSelector
  const showPlanModeControl = !isPlanSessionActive && Boolean(onComposerModeChange)
  const showAddMenu =
    Boolean(onAddImages) || showPlanModeControl || showContentModeControl || showSkills
  const showSkillQuick = showSkills
  const autoUsageLabel =
    capabilities.pasteMode === "review"
      ? " · 待质检"
      : capabilities.pasteMode === "edit"
        ? " · 待编辑"
        : capabilities.pasteMode === "analytics"
          ? " · 发布数据"
          : undefined
  return {
    capabilities, isPlanMode, applyUsage, handlePaste, handleDroppedFiles,
    allowedUsages: allowedUsages as PasteUsage[],
    pasteEnabled, effectivePasteUsage, canSubmit, canStop,
    showContentModeControl, showPlanModeControl, showAddMenu, showSkillQuick, autoUsageLabel,
  }
}

function useComposerLocalState(input: { value: string; skills: AimWorkbenchSkill[] }) {
  const { value, skills } = input
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [contentModeExpanded, setContentModeExpanded] = useState(false)
  const [skillQuery, setSkillQuery] = useState("")
  const [skillQuickOpen, setSkillQuickOpen] = useState(false)

  useAutoResizeTextarea(textareaRef, value)

  const filteredSkills = useMemo(
    () => buildFilteredSkills(skillQuery, skills),
    [skillQuery, skills],
  )
  const closeAddMenu = useCloseAddMenu(setAddMenuOpen, setContentModeExpanded, setSkillQuery, setSkillQuickOpen)
  useAddMenuCloseOnEscape(rootRef, addMenuOpen || skillQuickOpen, closeAddMenu)

  const toggleAddMenu = useMemo(
    () => () => {
      setAddMenuOpen((open) => {
        const next = !open
        if (next) setSkillQuickOpen(false)
        return next
      })
    },
    [],
  )
  const toggleSkillQuick = useMemo(
    () => () => {
      setSkillQuickOpen((open) => {
        const next = !open
        if (next) setAddMenuOpen(false)
        return next
      })
    },
    [],
  )

  return {
    rootRef, textareaRef, fileInputRef,
    addMenuOpen, setAddMenuOpen, toggleAddMenu, contentModeExpanded, setContentModeExpanded,
    skillQuery, setSkillQuery, filteredSkills, closeAddMenu,
    skillQuickOpen, toggleSkillQuick,
  }
}

function useAutoResizeTextarea(
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.max(Math.min(el.scrollHeight, 320), 48)}px`
  }, [value, textareaRef])
}

function useCloseAddMenu(
  setAddMenuOpen: (v: boolean) => void,
  setContentModeExpanded: (v: boolean) => void,
  setSkillQuery: (v: string) => void,
  setSkillQuickOpen: (v: boolean) => void,
) {
  return useMemo(() => {
    return function close() {
      setAddMenuOpen(false)
      setContentModeExpanded(false)
      setSkillQuery("")
      setSkillQuickOpen(false)
    }
  }, [setAddMenuOpen, setContentModeExpanded, setSkillQuery, setSkillQuickOpen])
}

function useAddMenuCloseOnEscape(
  rootRef: React.MutableRefObject<HTMLDivElement | null>,
  addMenuOpen: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!addMenuOpen) return
    function closeOnOutside(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      close()
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      close()
    }
    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [addMenuOpen, close, rootRef])
}
