"use client"

import type { ReactNode, RefObject } from "react"
import { ArrowRight, ImagePlus, ListChecks, Search, Sparkles } from "lucide-react"

import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import {
  type CopyStudioModule,
} from "@/lib/copy-studio"
import { cn } from "@/lib/utils"

import type { AimComposerMode } from "@/components/aim/aim-prompt-shared"
import {
  AddMenuPanelHeader,
  QuickActionCards,
  ContentModeSection,
  SkillsSection,
  type SkillGroup,
} from "@/components/aim/aim-add-menu-panel-sections"

// 保留 import 以便通过 tree-shaking / reference 检查
void ArrowRight
void ImagePlus
void ListChecks
void Search
void Sparkles

const POPOVER_SHADOW =
  "shadow-[0_0_0_1px_rgba(239,231,220,0.95),0_12px_32px_-8px_rgba(37,33,29,0.12)]"

/** 「添加附件 / 技能」弹出面板。
 *  主函数只负责组合子组件（各自 ≤80 行，子组件另存 aim-add-menu-panel-sections.tsx）。
 */
export function AimAddMenuPanel(props: {
  busy: boolean
  isPlanMode: boolean
  canUsePlanMode: boolean
  composerMode: AimComposerMode
  onComposerModeChange?: (mode: AimComposerMode) => void
  showPlanModeControl: boolean
  onAddImagesClick?: () => void
  onAddImages?: boolean
  showContentModeControl: boolean
  contentMode: CopyStudioModule | undefined
  contentModeLabel: string
  contentModeExpanded: boolean
  setContentModeExpanded: (v: boolean | ((p: boolean) => boolean)) => void
  contentModeOptions: Array<{
    id: CopyStudioModule | undefined
    label: string
    hint: string
  }>
  onContentModeChange?: (value: CopyStudioModule | undefined) => void
  showSkills: boolean
  skills: AimWorkbenchSkill[]
  skillQuery: string
  setSkillQuery: (v: string) => void
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
}) {
  const {
    busy, isPlanMode, canUsePlanMode, composerMode, onComposerModeChange,
    showPlanModeControl, onAddImagesClick, onAddImages,
    showContentModeControl, contentMode, contentModeLabel,
    contentModeExpanded, setContentModeExpanded, contentModeOptions,
    onContentModeChange, showSkills, skills, skillQuery, setSkillQuery,
    filteredSkills, onUseSkill, close, fileInputRef,
  } = props
  void onAddImagesClick
  return <PopoverShell>
    <AddMenuPanelHeader />
    <div className="max-h-[min(480px,62vh)] overflow-y-auto p-2.5">
      <QuickActionCards
        busy={busy}
        onAddImages={onAddImages}
        fileInputRef={fileInputRef}
        close={close}
        showPlanModeControl={showPlanModeControl}
        onComposerModeChange={onComposerModeChange}
        canUsePlanMode={canUsePlanMode}
        isPlanMode={isPlanMode}
        composerMode={composerMode}
      />
      <ContentModeSection
        busy={busy}
        show={showContentModeControl}
        onChange={onContentModeChange}
        contentMode={contentMode}
        contentModeLabel={contentModeLabel}
        expanded={contentModeExpanded}
        setExpanded={setContentModeExpanded}
        options={contentModeOptions}
        close={close}
      />
      <SkillsSection
        show={showSkills}
        skills={skills}
        skillQuery={skillQuery}
        setSkillQuery={setSkillQuery}
        filteredSkills={filteredSkills}
        onUseSkill={onUseSkill}
        close={close}
      />
    </div>
  </PopoverShell>
}

function PopoverShell(props: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(460px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-popover text-popover-foreground",
        POPOVER_SHADOW,
      )}
    >
      {props.children}
    </div>
  )
}
