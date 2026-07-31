"use client"

import type { ReactNode, RefObject } from "react"
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ImagePlus,
  ListChecks,
  Sparkles,
} from "lucide-react"

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

export type AddMenuView = "root" | "skills" | "modes"

function matchesQuery(query: string, ...terms: string[]) {
  if (!query) return true
  return terms.some((term) => term.toLowerCase().includes(query))
}

/* ------------------- 通用列表行（Cursor 风格） ------------------- */

export function MenuListRow(props: {
  icon: ReactNode
  label: string
  hint?: string
  trailing?: ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const { icon, label, hint, trailing, active, disabled, onClick } = props
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left transition-colors",
        "hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-45",
        active && "bg-primary/[0.07] text-primary",
      )}
    >
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center text-foreground/70",
          active && "text-primary",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-5 text-foreground">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      {trailing}
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-border/70" />
}

export function AddMenuSearch(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { value, onChange, placeholder = "添加图片、模式、技能…" } = props
  return (
    <div className="border-b border-border/60 px-3 py-2.5">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus
        className="w-full bg-transparent text-[13.5px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/75"
      />
    </div>
  )
}

export function AddMenuBackRow(props: {
  label: string
  onBack: () => void
}) {
  const { label, onBack } = props
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      <ArrowLeft className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  )
}

/* ------------------- Root：快捷动作 ------------------- */

export interface QuickActionRowsProps {
  busy: boolean
  onAddImages?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  close: () => void
  showPlanModeControl: boolean
  onComposerModeChange?: (mode: AimComposerMode) => void
  canUsePlanMode: boolean
  isPlanMode: boolean
  query: string
}

export function QuickActionRows(props: QuickActionRowsProps) {
  const {
    busy, onAddImages, fileInputRef, close,
    showPlanModeControl, onComposerModeChange,
    canUsePlanMode, isPlanMode, query,
  } = props
  const q = query.trim().toLowerCase()
  const showPlan =
    Boolean(showPlanModeControl && onComposerModeChange) &&
    matchesQuery(q, "计划模式", "plan")
  const showImage =
    Boolean(onAddImages) &&
    matchesQuery(q, "图片", "image", "上传")

  if (!showPlan && !showImage) return null

  return (
    <div className="space-y-0.5">
      {showPlan && onComposerModeChange ? (
        <MenuListRow
          icon={<ListChecks className="size-4" strokeWidth={1.75} />}
          label="计划模式"
          hint={isPlanMode ? "已开启 · 再点切回直接模式" : "先问关键问题再动笔"}
          active={isPlanMode}
          disabled={busy || (!canUsePlanMode && !isPlanMode)}
          trailing={isPlanMode ? <ActiveDot /> : undefined}
          onClick={() => {
            onComposerModeChange(isPlanMode ? "direct" : "plan")
            close()
          }}
        />
      ) : null}
      {showImage ? (
        <MenuListRow
          icon={<ImagePlus className="size-4" strokeWidth={1.75} />}
          label="图片"
          hint="上传参考图、产品图、手绘图"
          disabled={busy}
          onClick={() => {
            fileInputRef.current?.click()
            close()
          }}
        />
      ) : null}
    </div>
  )
}

function ActiveDot() {
  return <span className="size-1.5 shrink-0 rounded-full bg-primary" />
}

/* ------------------- 创作模式：根行 + 子列表 ------------------- */

export interface ContentModeSectionProps {
  busy: boolean
  show: boolean
  onChange?: (value: CopyStudioModule | undefined) => void
  contentMode: CopyStudioModule | undefined
  contentModeLabel: string
  view: AddMenuView
  setView: (view: AddMenuView) => void
  options: Array<{ id: CopyStudioModule | undefined; label: string; hint: string }>
  close: () => void
  query: string
}

export function ContentModeRootRow(props: {
  show: boolean
  onChange?: (value: CopyStudioModule | undefined) => void
  contentModeLabel: string
  setView: (view: AddMenuView) => void
  query: string
}) {
  const { show, onChange, contentModeLabel, setView, query } = props
  if (!show || !onChange) return null
  const q = query.trim().toLowerCase()
  if (!matchesQuery(q, "创作模式", "模式", contentModeLabel)) return null
  return (
    <MenuListRow
      icon={<Sparkles className="size-4" strokeWidth={1.75} />}
      label="创作模式"
      hint={`当前：${contentModeLabel}`}
      trailing={<ChevronRight className="size-3.5 text-muted-foreground/70" />}
      onClick={() => setView("modes")}
    />
  )
}

export function ContentModeSubList(props: ContentModeSectionProps) {
  const { busy, show, onChange, contentMode, options, close, setView, query } = props
  if (!show || !onChange) return null
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter((option) =>
        `${option.label} ${option.hint}`.toLowerCase().includes(q),
      )
    : options

  return (
    <div>
      <AddMenuBackRow label="创作模式" onBack={() => setView("root")} />
      <div className="space-y-0.5">
        {filtered.map((option) => (
          <MenuListRow
            key={option.label}
            icon={<Sparkles className="size-4" strokeWidth={1.75} />}
            label={option.label}
            hint={option.hint || undefined}
            active={contentMode === option.id}
            disabled={busy}
            trailing={contentMode === option.id ? <ActiveDot /> : undefined}
            onClick={() => {
              onChange(option.id)
              close()
            }}
          />
        ))}
        {filtered.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-[12px] text-muted-foreground">
            没有匹配的模式
          </p>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------- 技能：根行 + 子列表 ------------------- */

export interface SkillsSectionProps {
  show: boolean
  skills: AimWorkbenchSkill[]
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
  view: AddMenuView
  setView: (view: AddMenuView) => void
  query: string
}

export function SkillsRootRow(props: {
  show: boolean
  skills: AimWorkbenchSkill[]
  setView: (view: AddMenuView) => void
  query: string
}) {
  const { show, skills, setView, query } = props
  if (!show) return null
  const q = query.trim().toLowerCase()
  if (!matchesQuery(q, "技能", "skills")) return null
  return (
    <MenuListRow
      icon={<BookOpen className="size-4" strokeWidth={1.75} />}
      label="技能"
      hint={skills.length > 0 ? `${skills.length} 个内置技能` : "当前暂无内置技能"}
      trailing={<ChevronRight className="size-3.5 text-muted-foreground/70" />}
      onClick={() => setView("skills")}
    />
  )
}

export function SkillsSubList(props: SkillsSectionProps) {
  const { show, skills, filteredSkills, onUseSkill, close, setView } = props
  if (!show) return null
  const noResults =
    skills.length > 0 && filteredSkills.every(({ items }) => items.length === 0)

  return (
    <div>
      <AddMenuBackRow label="技能" onBack={() => setView("root")} />
      {skills.length === 0 ? (
        <p className="px-2.5 py-4 text-center text-[12px] text-muted-foreground">
          当前智能体暂无内置技能
        </p>
      ) : (
        <div className="space-y-1">
          {filteredSkills.map(({ group, items }) => (
            <SkillGroupRows
              key={group || "_default"}
              group={group}
              items={items}
              onUseSkill={onUseSkill}
              close={close}
            />
          ))}
        </div>
      )}
      {noResults ? (
        <p className="px-2.5 py-4 text-center text-[12px] text-muted-foreground">
          没有找到匹配的技能
        </p>
      ) : null}
    </div>
  )
}

/** 搜索时在根层直接铺平匹配技能，不必先进子页 */
export function SkillsSearchHits(props: {
  show: boolean
  query: string
  filteredSkills: SkillGroup[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { show, query, filteredSkills, onUseSkill, close } = props
  if (!show || !query.trim()) return null
  const items = filteredSkills.flatMap((group) => group.items)
  if (items.length === 0) return null
  return (
    <div className="space-y-0.5">
      {items.map((skill) => (
        <SkillListRow
          key={skill.id}
          skill={skill}
          onUseSkill={onUseSkill}
          close={close}
        />
      ))}
    </div>
  )
}

function SkillGroupRows(props: {
  group: string
  items: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { group, items, onUseSkill, close } = props
  if (items.length === 0) return null
  return (
    <div>
      {group ? (
        <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {COPY_STUDIO_MODULE_LABELS[group as keyof typeof COPY_STUDIO_MODULE_LABELS] ?? group}
        </p>
      ) : null}
      <div className="space-y-0.5">
        {items.map((skill) => (
          <SkillListRow
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

function SkillListRow(props: {
  skill: AimWorkbenchSkill
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { skill, onUseSkill, close } = props
  return (
    <MenuListRow
      icon={<BookOpen className="size-4" strokeWidth={1.75} />}
      label={skill.label}
      hint={skill.description}
      onClick={() => {
        onUseSkill?.(skill)
        close()
      }}
    />
  )
}
