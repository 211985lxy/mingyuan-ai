"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

import type { AimGeneration } from "@/lib/api/client"
import { listPendingAimHistory } from "@/lib/api/client"
import { buildAimGenerationHref } from "@/features/aim/workflow/tasks"
import { getContentTitle } from "@/lib/home-history-summary"
import {
  buildAimAgentHref,
  listVisibleAimAgents,
  type AimAgentMeta,
} from "@/lib/aim-ui-config"

/**
 * 创作台总览：居中一句标题 + 五个专家入口。无工作流、无落地页输入框。
 */
export function AimLandingHero({
  intro: _intro,
}: {
  /** @deprecated 总览页不再展示单一专家简介 */
  intro?: string
} = {}) {
  const experts = listVisibleAimAgents()

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 sm:py-14">
      <HeroAmbientLayer />
      <div className="flex w-full max-w-lg flex-col items-center gap-8">
        <AimContinueLast />
        <HeroHeadline />
        <ExpertEntryList experts={experts} />
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
          "radial-gradient(55% 40% at 50% 8%, oklch(0.575 0.205 28 / 0.08), transparent 68%),\n" +
          "             radial-gradient(40% 35% at 18% 22%, oklch(0.945 0.025 76 / 0.4), transparent 62%)",
      }}
    />
  )
}

function HeroHeadline() {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="text-[11px] font-medium tracking-wide text-primary/85">
        明远 AIM · 创作台
      </p>
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-tight">
        选一位专家，开始创作
      </h1>
    </div>
  )
}

function ExpertEntryList({ experts }: { experts: AimAgentMeta[] }) {
  return (
    <nav aria-label="AIM 专家" className="w-full">
      <ul className="flex flex-col">
        {experts.map((agent, index) => {
          const Icon = agent.icon
          const label = agent.displayTitle ?? agent.title
          const isLast = index === experts.length - 1
          return (
            <li key={agent.id}>
              <Link
                href={buildAimAgentHref(agent.id)}
                className={[
                  "group flex items-center gap-3.5 py-3.5 transition-colors",
                  !isLast ? "border-b border-border/50" : "",
                  "hover:border-primary/25",
                ].join(" ")}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground group-hover:text-primary">
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {agent.description}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
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
      className="group -mb-2 flex w-full items-center gap-3 border-b border-border/50 pb-4 text-left transition-colors hover:border-primary/40"
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
