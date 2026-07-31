"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Bell, BarChart2, Bookmark } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { OpportunityDailyPanel } from "@/features/opportunities/components/opportunity-daily-panel"
import { OpportunityBenchmarksPanel } from "@/features/opportunities/components/opportunity-benchmarks-panel"
import { OpportunityCollectionsPanel } from "@/features/opportunities/components/opportunity-collections-panel"

const VALID_TABS = new Set(["daily", "benchmarks", "collections"])
const DEFAULT_TAB = "benchmarks"

const SEGMENTS = [
  { value: "benchmarks", label: "对标账号", icon: BarChart2 },
  { value: "daily", label: "今日机会", icon: Bell },
  { value: "collections", label: "已收藏研究", icon: Bookmark },
] as const

export default function OpportunitiesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get("tab") || DEFAULT_TAB
  const tab = VALID_TABS.has(rawTab) ? rawTab : DEFAULT_TAB

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <WorkbenchHero
        title="市场洞察"
        subtitle="监控对标账号、捕捉今日热点、沉淀选题研究"
        badge={<Badge variant="secondary">抖音 + 视频号</Badge>}
      />

      {/* 胶囊式分段控件 */}
      <div className="mb-6 mt-4 inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {SEGMENTS.map((seg) => {
          const active = tab === seg.value
          const Icon = seg.icon
          return (
            <button
              key={seg.value}
              onClick={() => {
                const next = seg.value === DEFAULT_TAB ? "/opportunities" : `/opportunities?tab=${seg.value}`
                router.replace(next)
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {seg.label}
            </button>
          )
        })}
      </div>

      {/* 内容区 */}
      {tab === "benchmarks" ? <OpportunityBenchmarksPanel /> : null}
      {tab === "daily" ? <OpportunityDailyPanel /> : null}
      {tab === "collections" ? <OpportunityCollectionsPanel /> : null}
    </div>
  )
}
