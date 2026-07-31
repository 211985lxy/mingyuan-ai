"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"

import type { AimGeneration } from "@/lib/api/client"
import { listPendingAimHistory } from "@/lib/api/client"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { buildAimGenerationHref } from "@/features/aim/workflow/tasks"
import { getContentTitle } from "@/lib/home-history-summary"

/**
 * 创作台空状态：继续上次 + 专家简介 + 目的入口列表 + 输入框。
 * 从 aim-workbench-chrome.tsx 拆出以控制单函数行数 ≤80。
 */
export function AimLandingHero({
  purposes,
  intro,
  onSelectPurpose,
  children,
}: {
  purposes: AimWorkbenchSkill[]
  intro?: string
  onSelectPurpose: (skill: AimWorkbenchSkill) => void
  children: ReactNode
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
      <HeroAmbientLayer />
      <div className="flex w-full max-w-2xl flex-col items-center gap-5">
        <AimContinueLast />
        <HeroHeadline intro={intro} />
        {purposes.length > 0 ? (
          <PurposeList purposes={purposes} onSelect={onSelectPurpose} />
        ) : null}
        <div className="w-full">{children}</div>
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/projects"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            我的项目
          </Link>
        </p>
      </div>
    </div>
  )
}

function HeroAmbientLayer() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background:
          "radial-gradient(60% 45% at 50% 0%, oklch(0.575 0.205 28 / 0.07), transparent 70%),\n" +
          "             radial-gradient(45% 40% at 12% 18%, oklch(0.745 0.185 38 / 0.06), transparent 65%),\n" +
          "             radial-gradient(55% 55% at 88% 35%, oklch(0.945 0.025 76 / 0.35), transparent 70%)",
      }}
    />
  )
}

function HeroHeadline(props: { intro?: string }) {
  const { intro } = props
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary/90">
        <span className="size-1.5 rounded-full bg-primary/70" />
        AI 协作台 · 专家待命
      </div>
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-tight">
        今天想得到什么结果？
      </h1>
      {intro ? (
        <p className="mx-auto max-w-xl text-center text-sm leading-7 text-muted-foreground">
          {intro}
        </p>
      ) : null}
    </div>
  )
}

/** 内容目的：默认收成一条入口，点开后是紧凑列表（不再铺三张大卡片）。 */
function PurposeList(props: {
  purposes: AimWorkbenchSkill[]
  onSelect: (skill: AimWorkbenchSkill) => void
}) {
  const { purposes, onSelect } = props
  // 进入空态即展开列表；需要让位给输入框时可收起
  const [open, setOpen] = useState(true)

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-3.5 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-card"
      >
        <span className="text-[13px] font-medium text-foreground">
          一键开始 · 选择内容目的
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {open ? "收起" : `${purposes.length} 项`}
          <ChevronGlyph open={open} />
        </span>
      </button>
      {open ? (
        <ul className="mt-1.5 overflow-hidden rounded-xl border border-border/70 bg-card">
          {purposes.map((skill, index) => (
            <li
              key={skill.id}
              className={index > 0 ? "border-t border-border/60" : undefined}
            >
              <PurposeListRow skill={skill} onSelect={() => {
                onSelect(skill)
                setOpen(false)
              }} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function PurposeListRow(props: {
  skill: AimWorkbenchSkill
  onSelect: () => void
}) {
  const { skill, onSelect } = props
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-primary/[0.04]"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <SparklesFilled className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold leading-5 text-foreground">
          {skill.label}
        </span>
        {skill.description ? (
          <span className="mt-0.5 block truncate text-[12px] leading-4 text-muted-foreground">
            {skill.description}
          </span>
        ) : null}
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

function ChevronGlyph(props: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`size-3.5 transition-transform duration-200 ${props.open ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6.25 8 10l4-3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SparklesFilled(props: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={props.className}
    >
      <path
        d="M12 2.25c.5 2.4 2.35 4.25 4.75 4.75-2.4.5-4.25 2.35-4.75 4.75-.5-2.4-2.35-4.25-4.75-4.75 2.4-.5 4.25-2.35 4.75-4.75Z"
        fill="currentColor"
      />
      <path
        d="M19.25 12.5c.25 1.2 1.18 2.12 2.37 2.37-1.2.25-2.12 1.18-2.37 2.37-.25-1.2-1.18-2.12-2.37-2.37 1.2-.25 2.12-1.18 2.37-2.37Z"
        fill="currentColor"
        opacity=".8"
      />
      <path
        d="M5 13.25c.35 1.65 1.6 2.9 3.25 3.25-1.65.35-2.9 1.6-3.25 3.25-.35-1.65-1.6-2.9-3.25-3.25 1.65-.35 2.9-1.6 3.25-3.25Z"
        fill="currentColor"
        opacity=".65"
      />
    </svg>
  )
}

function AimContinueLast() {
  const [item, setItem] = useState<AimGeneration | null>(null)

  useEffect(() => {
    let cancelled = false
    listPendingAimHistory(1)
      .then((data) => {
        if (!cancelled) setItem(data.items[0] ?? null)
      })
      .catch(() => {
        if (!cancelled) setItem(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!item) return null

  return (
    <Link
      href={buildAimGenerationHref(item)}
      className="group flex w-full items-center gap-3 border-b border-border/60 pb-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">继续上次</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground group-hover:text-primary">
          {getContentTitle(item)}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
    </Link>
  )
}
