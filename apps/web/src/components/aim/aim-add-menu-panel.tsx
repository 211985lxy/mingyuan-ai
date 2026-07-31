"use client"

import { useEffect, useState, type RefObject } from "react"

import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { type CopyStudioModule } from "@/lib/copy-studio"
import { cn } from "@/lib/utils"

import type { AimComposerMode } from "@/components/aim/aim-prompt-shared"
import {
  AddMenuSearch,
  ContentModeRootRow,
  ContentModeSubList,
  MenuDivider,
  QuickActionRows,
  SkillsRootRow,
  SkillsSearchHits,
  SkillsSubList,
  type AddMenuView,
  type SkillGroup,
} from "@/components/aim/aim-add-menu-panel-sections"

const POPOVER_SHADOW =
  "shadow-[0_0_0_1px_rgba(239,231,220,0.95),0_12px_32px_-8px_rgba(37,33,29,0.12)]"

/**
 * 「+」弹出面板：Cursor 风格搜索 + 列表行。
 * 根层是快捷动作 / 创作模式 / 技能入口；点带 › 的项再钻进子列表。
 */
type AimAddMenuProps = {
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
  contentModeOptions: Array<{ id: CopyStudioModule | undefined; label: string; hint: string }>
  onContentModeChange?: (value: CopyStudioModule | undefined) => void
  showSkills: boolean
  skills: AimWorkbenchSkill[]
  skillQuery: string
  setSkillQuery: (v: string) => void
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
}

function useAddMenuViewController(setContentModeExpanded: AimAddMenuProps["setContentModeExpanded"], skillQuery: string) {
  const [view, setView] = useState<AddMenuView>("root")
  useEffect(() => { setContentModeExpanded(view === "modes") }, [view, setContentModeExpanded])
  useEffect(() => { if (skillQuery.trim() && view !== "root") setView("root") }, [skillQuery, view])
  return { view, setView }
}

function renderAddMenuBody(
  view: AddMenuView, setView: (v: AddMenuView) => void,
  props: AimAddMenuProps, skillQuery: string, setSkillQuery: (v: string) => void,
  close: () => void, fileInputRef: RefObject<HTMLInputElement | null>,
) {
  return (
    <>
      <AddMenuSearch value={skillQuery} onChange={setSkillQuery} />
      <div className="max-h-[min(420px,58vh)] overflow-y-auto p-1.5">
        {view === "root" ? (
          <RootMenu
            busy={props.busy} onAddImages={props.onAddImages} fileInputRef={fileInputRef}
            close={close} showPlanModeControl={props.showPlanModeControl}
            onComposerModeChange={props.onComposerModeChange}
            canUsePlanMode={props.canUsePlanMode} isPlanMode={props.isPlanMode}
            query={skillQuery} showContentModeControl={props.showContentModeControl}
            onContentModeChange={props.onContentModeChange} contentModeLabel={props.contentModeLabel}
            setView={setView} showSkills={props.showSkills} skills={props.skills}
            filteredSkills={props.filteredSkills} onUseSkill={props.onUseSkill}
          />
        ) : null}
        {view === "modes" ? (
          <ContentModeSubList
            busy={props.busy} show={props.showContentModeControl}
            onChange={props.onContentModeChange} contentMode={props.contentMode}
            contentModeLabel={props.contentModeLabel} view={view} setView={setView}
            options={props.contentModeOptions} close={close} query={skillQuery}
          />
        ) : null}
        {view === "skills" ? (
          <SkillsSubList
            show={props.showSkills} skills={props.skills}
            filteredSkills={props.filteredSkills} onUseSkill={props.onUseSkill}
            close={close} view={view} setView={setView} query={skillQuery}
          />
        ) : null}
      </div>
    </>
  )
}

export function AimAddMenuPanel(rawProps: AimAddMenuProps) {
  void rawProps.composerMode
  void rawProps.onAddImagesClick
  void rawProps.contentModeExpanded
  const { view, setView } = useAddMenuViewController(rawProps.setContentModeExpanded, rawProps.skillQuery)
  return (
    <PopoverShell>
      {renderAddMenuBody(view, setView, rawProps, rawProps.skillQuery, rawProps.setSkillQuery, rawProps.close, rawProps.fileInputRef)}
    </PopoverShell>
  )
}

function RootMenu(props: {
  busy: boolean
  onAddImages?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  close: () => void
  showPlanModeControl: boolean
  onComposerModeChange?: (mode: AimComposerMode) => void
  canUsePlanMode: boolean
  isPlanMode: boolean
  query: string
  showContentModeControl: boolean
  onContentModeChange?: (value: CopyStudioModule | undefined) => void
  contentModeLabel: string
  setView: (view: AddMenuView) => void
  showSkills: boolean
  skills: AimWorkbenchSkill[]
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
}) {
  const {
    busy, onAddImages, fileInputRef, close,
    showPlanModeControl, onComposerModeChange, canUsePlanMode, isPlanMode,
    query, showContentModeControl, onContentModeChange, contentModeLabel,
    setView, showSkills, skills, filteredSkills, onUseSkill,
  } = props
  const searching = Boolean(query.trim())

  return (
    <>
      <QuickActionRows
        busy={busy}
        onAddImages={onAddImages}
        fileInputRef={fileInputRef}
        close={close}
        showPlanModeControl={showPlanModeControl}
        onComposerModeChange={onComposerModeChange}
        canUsePlanMode={canUsePlanMode}
        isPlanMode={isPlanMode}
        query={query}
      />
      {!searching ? <MenuDivider /> : null}
      <div className="space-y-0.5">
        {!searching ? (
          <>
            <ContentModeRootRow
              show={showContentModeControl}
              onChange={onContentModeChange}
              contentModeLabel={contentModeLabel}
              setView={setView}
              query={query}
            />
            <SkillsRootRow
              show={showSkills}
              skills={skills}
              setView={setView}
              query={query}
            />
          </>
        ) : (
          <>
            <ContentModeRootRow
              show={showContentModeControl}
              onChange={onContentModeChange}
              contentModeLabel={contentModeLabel}
              setView={setView}
              query={query}
            />
            <SkillsSearchHits
              show={showSkills}
              query={query}
              filteredSkills={filteredSkills}
              onUseSkill={onUseSkill}
              close={close}
            />
          </>
        )}
      </div>
    </>
  )
}

function PopoverShell(props: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(320px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-popover text-popover-foreground",
        POPOVER_SHADOW,
      )}
    >
      {props.children}
    </div>
  )
}
