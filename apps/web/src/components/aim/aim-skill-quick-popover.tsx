"use client"

import { Pencil, Plus, Sparkles } from "lucide-react"

import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { cn } from "@/lib/utils"

const POPOVER_SHADOW =
  "shadow-[0_0_0_1px_rgba(239,231,220,0.95),0_12px_32px_-8px_rgba(37,33,29,0.12)]"

/** 左下角「技能」按钮的速选面板：列出当前 agent 的 skill，点击即套用。
 *  自定义 skill 卡片右上角显示编辑按钮；底部有「+ 新建技能」入口。 */
export function AimSkillQuickPopover(props: {
  skills: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  onAddSkill?: () => void
  onEditSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { skills, onUseSkill, onAddSkill, onEditSkill, close } = props
  return (
    <div
      className={cn(
        "absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(420px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-popover text-popover-foreground",
        POPOVER_SHADOW,
      )}
    >
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            技能
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/70">
            点一下按这个目的直接出稿
          </p>
        </div>
        {onAddSkill ? (
          <button
            type="button"
            onClick={onAddSkill}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            <Plus className="size-3" strokeWidth={2.2} />
            新建
          </button>
        ) : null}
      </div>
      <div className="max-h-[min(360px,52vh)] space-y-1.5 overflow-y-auto p-2 pt-0.5">
        {skills.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 py-5 text-center text-[12px] text-muted-foreground/80">
            当前智能体暂无技能
          </p>
        ) : (
          skills.map((skill) => (
            <SkillQuickItem
              key={skill.id}
              skill={skill}
              onUseSkill={onUseSkill}
              onEditSkill={onEditSkill}
              close={close}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SkillQuickItem(props: {
  skill: AimWorkbenchSkill
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  onEditSkill?: (skill: AimWorkbenchSkill) => void
  close: () => void
}) {
  const { skill, onUseSkill, onEditSkill, close } = props
  return (
    <div
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border border-transparent bg-card/40 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.04] hover:shadow-[0_4px_14px_-6px_rgba(209,74,51,0.18)]",
        skill.isCustom ? "ring-1 ring-inset ring-amber-500/15" : "",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        onClick={() => {
          onUseSkill?.(skill)
          close()
        }}
      >
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/12 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/15">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-5 tracking-tight text-foreground">
            {skill.label}
            {skill.isCustom ? (
              <span className="ml-1.5 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium uppercase text-amber-600">
                自定义
              </span>
            ) : null}
          </p>
          {skill.description ? (
            <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground/90">
              {skill.description}
            </p>
          ) : null}
        </div>
      </button>
      {skill.isCustom && onEditSkill ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEditSkill(skill)
          }}
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          title="编辑"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
