"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"

import type { AimGeneration } from "@/lib/api/client"
import { listPendingAimHistory } from "@/lib/api/client"
import { buildAimGenerationHref } from "@/features/aim/workflow/tasks"
import { getContentTitle } from "@/lib/home-history-summary"

/**
 * 创作台空状态：继续上次 + 专家简介 + 输入框。
 * 内容目的已收进左下角「+」菜单，不再在落地页单独铺列表。
 */
export function AimLandingHero({
  intro,
  children,
}: {
  intro?: string
  children: ReactNode
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
      <HeroAmbientLayer />
      <div className="flex w-full max-w-2xl flex-col items-center gap-5">
        <AimContinueLast />
        <HeroHeadline intro={intro} />
        <div className="w-full">{children}</div>
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/projects"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            我的项目
          </Link>
          <span className="mx-1.5 text-border">·</span>
          内容目的在左下角「+」里
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
