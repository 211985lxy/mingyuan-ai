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
 * 创作台空状态：继续上次 + 专家简介 + 目的入口卡片 + 输入框。
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
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
      <HeroAmbientLayer />
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <AimContinueLast />
        <HeroHeadline intro={intro} />
        {purposes.length > 0 ? <PurposeCards purposes={purposes} onSelect={onSelectPurpose} /> : null}
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

function PurposeCards(props: {
  purposes: AimWorkbenchSkill[]
  onSelect: (skill: AimWorkbenchSkill) => void
}) {
  const { purposes, onSelect } = props
  return (
    <div className="w-full">
      <p className="mb-2.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
        一键开始 · 选择内容目的
      </p>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {purposes.map((skill) => (
          <PurposeCard key={skill.id} skill={skill} onSelect={() => onSelect(skill)} />
        ))}
      </div>
    </div>
  )
}

function PurposeCard(props: {
  skill: AimWorkbenchSkill
  onSelect: () => void
}) {
  const { skill, onSelect } = props
  return (
    <button
      key={skill.id}
      type="button"
      onClick={onSelect}
      className="group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border border-border/80 bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-gradient-to-br hover:from-card hover:via-primary/[0.03] hover:to-amber-500/[0.02] hover:shadow-[0_10px_30px_-14px_rgba(209,74,51,0.22)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-20 w-20 translate-x-8 -translate-y-8 rounded-full bg-primary/[0.06] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/15">
            <SparklesFilled className="size-4.5" strokeWidth={0} />
          </span>
          <span className="text-[15px] font-semibold leading-5 tracking-tight text-foreground">
            {skill.label}
          </span>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      {skill.description ? (
        <p className="pl-[46px] text-[13px] leading-5 text-muted-foreground/90">
          {skill.description}
        </p>
      ) : null}
    </button>
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
