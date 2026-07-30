"use client"

import type { RefObject } from "react"
import { ArrowRight, ImagePlus, ListChecks, Search, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import {
  COPY_STUDIO_MODULE_LABELS,
  type CopyStudioModule,
} from "@/lib/copy-studio"
import { cn } from "@/lib/utils"

import type { AimComposerMode } from "@/components/aim/aim-prompt-shared"

export interface SkillGroup {
  group: string
  items: AimWorkbenchSkill[]
}

/* ------------------- AddMenuPanel Section 子组件 ------------------- */

export function AddMenuPanelHeader() {
  return (
    <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-muted/60 via-muted/30 to-transparent px-3.5 py-2.5">
      <div>
        <p className="text-[13px] font-semibold tracking-tight text-foreground">
          添加附件 / 技能
        </p>
        <p className="text-[11px] text-muted-foreground/90">
          图片、创作模式、内置技能一键加入上下文
        </p>
      </div>
    </div>
  )
}

export interface QuickActionCardsProps {
  busy: boolean
  onAddImages?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  close: () => void
  showPlanModeControl: boolean
  onComposerModeChange?: (mode: AimComposerMode) => void
  canUsePlanMode: boolean
  isPlanMode: boolean
  composerMode: AimComposerMode
}

export function QuickActionCards(props: QuickActionCardsProps) {
  const {
    busy, onAddImages, fileInputRef, close,
    showPlanModeControl, onComposerModeChange,
    canUsePlanMode, isPlanMode, composerMode,
  } = props
  const any = onAddImages || (showPlanModeControl && onComposerModeChange)
  if (!any) return null
  return (
    <div className="mb-2.5 grid grid-cols-2 gap-2">
      {onAddImages ? (
        <AddImagesCard busy={busy} fileInputRef={fileInputRef} close={close} />
      ) : null}
      {showPlanModeControl && onComposerModeChange ? (
        <PlanModeCard
          busy={busy}
          canUsePlanMode={canUsePlanMode}
          isPlanMode={isPlanMode}
          composerMode={composerMode}
          onChange={onComposerModeChange}
          close={close}
        />
      ) : null}
    </div>
  )
}

function AddImagesCard(props: {
  busy: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  close: () => void
}) {
  const { busy, fileInputRef, close } = props
  return (
    <button
      type="button"
      disabled={busy}
      className="group flex flex-col items-start gap-1.5 rounded-xl border border-border/80 bg-card/50 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] disabled:opacity-50 disabled:hover:translate-y-0"
      onClick={() => {
        fileInputRef.current?.click()
        close()
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/12 to-indigo-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/15">
          <ImagePlus className="h-4 w-4" strokeWidth={2} />
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="mt-0.5">
        <p className="text-[13px] font-semibold leading-4 text-foreground">图片</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/90">
          上传参考图、产品图、手绘图
        </p>
      </div>
    </button>
  )
}

function PlanModeCard(props: {
  busy: boolean
  canUsePlanMode: boolean
  isPlanMode: boolean
  composerMode: AimComposerMode
  onChange: (mode: AimComposerMode) => void
  close: () => void
}) {
  const { busy, canUsePlanMode, isPlanMode, composerMode, onChange, close } = props
  return (
    <button
      type="button"
      disabled={busy || (!canUsePlanMode && !isPlanMode)}
      title={
        !canUsePlanMode && !isPlanMode
          ? "请先选择 IP 营销全案"
          : isPlanMode
            ? "切回直接模式"
            : "开启计划模式"
      }
      className={cn(
        "group flex flex-col items-start gap-1.5 rounded-xl border bg-card/50 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0",
        isPlanMode
          ? "border-primary/35 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent"
          : "border-border/80 hover:border-primary/30 hover:bg-primary/[0.04]",
      )}
      onClick={() => {
        onChange(isPlanMode ? "direct" : "plan")
        close()
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-lg ring-1 ring-inset",
            isPlanMode
              ? "bg-gradient-to-br from-primary/15 to-amber-500/10 text-primary ring-primary/15"
              : "bg-gradient-to-br from-violet-500/12 to-fuchsia-500/10 text-violet-600 ring-violet-500/15",
          )}
        >
          <ListChecks className="h-4 w-4" strokeWidth={2} />
        </span>
        <PlanModeBadge isPlanMode={isPlanMode} />
      </div>
      <div className="mt-0.5">
        <p className="text-[13px] font-semibold leading-4 text-foreground">计划模式</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/90">
          {isPlanMode ? "先拆解规格再生成，结果更可控" : "先问你几个关键问题再动笔"}
        </p>
      </div>
      <span className="hidden" aria-hidden>{composerMode}</span>
    </button>
  )
}

function PlanModeBadge(props: { isPlanMode: boolean }) {
  const { isPlanMode } = props
  if (!isPlanMode) {
    return (
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    )
  }
  return (
    <div className="flex items-center gap-1">
      <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">
        开启
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </div>
  )
}

export interface ContentModeSectionProps {
  busy: boolean
  show: boolean
  onChange?: (value: CopyStudioModule | undefined) => void
  contentMode: CopyStudioModule | undefined
  contentModeLabel: string
  expanded: boolean
  setExpanded: (v: boolean | ((p: boolean) => boolean)) => void
  options: Array<{ id: CopyStudioModule | undefined; label: string; hint: string }>
  close: () => void
}

export function ContentModeSection(props: ContentModeSectionProps) {
  const { busy, show, onChange, contentMode, contentModeLabel,
    expanded, setExpanded, options, close } = props
  if (!show || !onChange) return null
  return (
    <div className="mb-2.5 rounded-xl border border-border/70 bg-card/30 p-2.5">
      <ContentModeHeader
        busy={busy}
        contentModeLabel={contentModeLabel}
        expanded={expanded}
        setExpanded={setExpanded}
      />
      {expanded ? (
        <ContentModeOptions
          contentMode={contentMode}
          options={options}
          onChange={onChange}
          close={close}
        />
      ) : null}
    </div>
  )
}

function ContentModeHeader(props: {
  busy: boolean
  contentModeLabel: string
  expanded: boolean
  setExpanded: (v: boolean | ((p: boolean) => boolean)) => void
}) {
  const { busy, contentModeLabel, expanded, setExpanded } = props
  return (
    <button
      type="button"
      disabled={busy}
      className="flex w-full items-center gap-2.5 text-left transition-colors"
      onClick={() => setExpanded((open) => !open)}
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/12 to-orange-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/15">
        <Sparkles className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-4 text-foreground">创作模式</p>
        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground/90">
          当前：{contentModeLabel}
        </p>
      </div>
      <ChevronDown expanded={expanded} />
    </button>
  )
}

function ChevronDown(props: { expanded: boolean }) {
  const { expanded } = props
  return (
    <svg
      className={cn(
        "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
        expanded && "rotate-180",
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
  )
}

function ContentModeOptions(props: {
  contentMode: CopyStudioModule | undefined
  options: Array<{ id: CopyStudioModule | undefined; label: string; hint: string }>
  onChange: (value: CopyStudioModule | undefined) => void
  close: () => void
}) {
  const { contentMode, options, onChange, close } = props
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border/60 pt-2">
      {options.map((option) => (
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
            onChange(option.id)
            close()
          }}
        >
          <span
            className={cn(
              "text-[12.5px] leading-4",
              contentMode === option.id
                ? "font-semibold text-primary"
                : "font-medium text-foreground/90",
            )}
          >
            {option.label}
          </span>
          {option.hint ? (
            <span className="mt-0.5 text-[10.5px] leading-3.5 text-muted-foreground/90">
              {option.hint}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export interface SkillsSectionProps {
  show: boolean
  skills: AimWorkbenchSkill[]
  skillQuery: string
  setSkillQuery: (v: string) => void
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}

export function SkillsSection(props: SkillsSectionProps) {
  const {
    show, skills, skillQuery, setSkillQuery,
    filteredSkills, onUseSkill, close,
  } = props
  if (!show) return null
  return (
    <div>
      <div className="mb-2 flex items-end justify-between px-0.5">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            内置技能
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/70">
            一键套用专家提示词，快速启动
          </p>
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
      <SkillsList
        skills={skills}
        filteredSkills={filteredSkills}
        onUseSkill={onUseSkill}
        close={close}
      />
    </div>
  )
}

function SkillsList(props: {
  skills: AimWorkbenchSkill[]
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { skills, filteredSkills, onUseSkill, close } = props
  const noResults =
    skills.length > 0 && filteredSkills.every(({ items }) => items.length === 0)
  return (
    <div className="space-y-2.5">
      {skills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-[12px] text-muted-foreground/80">
          当前智能体暂无内置技能
        </p>
      ) : (
        filteredSkills.map(({ group, items }) => (
          <SkillGroupBlock
            key={group || "_default"}
            group={group}
            items={items}
            onUseSkill={onUseSkill}
            close={close}
          />
        ))
      )}
      {noResults ? (
        <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-[12px] text-muted-foreground/80">
          没有找到匹配的技能
        </p>
      ) : null}
    </div>
  )
}

function SkillGroupBlock(props: {
  group: string
  items: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { group, items, onUseSkill, close } = props
  return (
    <div key={group || "_default"} className="space-y-1.5">
      {group ? (
        <div className="flex items-center gap-2 px-0.5">
          <span className="h-px flex-1 bg-border/60" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {COPY_STUDIO_MODULE_LABELS[group as keyof typeof COPY_STUDIO_MODULE_LABELS] ?? group}
          </p>
          <span className="h-px flex-1 bg-border/60" />
        </div>
      ) : null}
      <div className="space-y-1.5">
        {items.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onUseSkill={onUseSkill}
            close={close}
          />
        ))}
      </div>
    </div>
  )
}

function SkillCard(props: {
  skill: AimWorkbenchSkill
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { skill, onUseSkill, close } = props
  return (
    <button
      type="button"
      className="group flex w-full items-start gap-3 rounded-xl border border-transparent bg-card/40 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.04] hover:shadow-[0_4px_14px_-6px_rgba(209,74,51,0.18)]"
      onClick={() => {
        onUseSkill?.(skill)
        close()
      }}
    >
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/12 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/15">
        <SkillSparkleIcon />
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
  )
}

function SkillSparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-4"
      xmlns="http://www.w3.org/2000/svg"
    >
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
  )
}
