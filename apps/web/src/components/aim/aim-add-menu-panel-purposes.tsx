"use client"

import { ChevronRight, Target } from "lucide-react"

import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

import {
  AddMenuBackRow,
  MenuListRow,
  type AddMenuView,
  type SkillGroup,
} from "@/components/aim/aim-add-menu-panel-sections"

/** 落地页已收起；三条内容目的只在「+」菜单独立子页里选。 */
export const CONTENT_PURPOSE_GROUP = "内容目的"

export function isContentPurposeSkill(skill: AimWorkbenchSkill) {
  return skill.group === CONTENT_PURPOSE_GROUP
}

export function excludeContentPurposeSkills(skills: AimWorkbenchSkill[]) {
  return skills.filter((skill) => !isContentPurposeSkill(skill))
}

export function excludeContentPurposeGroups(groups: SkillGroup[]) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((skill) => !isContentPurposeSkill(skill)),
    }))
    .filter((group) => group.items.length > 0)
}

function matchesQuery(query: string, ...terms: string[]) {
  if (!query) return true
  return terms.some((term) => term.toLowerCase().includes(query))
}

/* ------------------- 内容目的：根行 + 子列表 ------------------- */

export function PurposesRootRow(props: {
  purposes: AimWorkbenchSkill[]
  setView: (view: AddMenuView) => void
  query: string
}) {
  const { purposes, setView, query } = props
  if (purposes.length === 0) return null
  const q = query.trim().toLowerCase()
  const purposeTerms = purposes.flatMap((skill) => [skill.label, skill.description])
  if (!matchesQuery(q, "内容目的", "目的", ...purposeTerms)) return null
  const hint =
    purposes.length <= 3
      ? purposes.map((skill) => skill.label).join(" / ")
      : `${purposes.length} 个目的`
  return (
    <MenuListRow
      icon={<Target className="size-4" strokeWidth={1.75} />}
      label="内容目的"
      hint={hint}
      trailing={<ChevronRight className="size-3.5 text-muted-foreground/70" />}
      onClick={() => setView("purposes")}
    />
  )
}

export function PurposesSubList(props: {
  purposes: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
  setView: (view: AddMenuView) => void
  query: string
}) {
  const { purposes, onUseSkill, close, setView, query } = props
  const q = query.trim().toLowerCase()
  const filtered = q
    ? purposes.filter((skill) =>
        `${skill.label} ${skill.description}`.toLowerCase().includes(q),
      )
    : purposes

  return (
    <div>
      <AddMenuBackRow label="内容目的" onBack={() => setView("root")} />
      <div className="space-y-0.5">
        {filtered.map((skill) => (
          <MenuListRow
            key={skill.id}
            icon={<Target className="size-4" strokeWidth={1.75} />}
            label={skill.label}
            hint={skill.description}
            onClick={() => {
              onUseSkill?.(skill)
              close()
            }}
          />
        ))}
        {filtered.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-[12px] text-muted-foreground">
            没有匹配的内容目的
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** 搜索时在根层直接铺平匹配的内容目的，不必先进子页 */
export function PurposesSearchHits(props: {
  query: string
  purposes: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { query, purposes, onUseSkill, close } = props
  if (!query.trim()) return null
  const q = query.trim().toLowerCase()
  const items = purposes.filter((skill) =>
    `${skill.label} ${skill.description}`.toLowerCase().includes(q),
  )
  if (items.length === 0) return null
  return (
    <div className="space-y-0.5">
      {items.map((skill) => (
        <MenuListRow
          key={skill.id}
          icon={<Target className="size-4" strokeWidth={1.75} />}
          label={skill.label}
          hint={skill.description}
          onClick={() => {
            onUseSkill?.(skill)
            close()
          }}
        />
      ))}
    </div>
  )
}
