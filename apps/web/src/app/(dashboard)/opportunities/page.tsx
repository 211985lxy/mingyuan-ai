"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Search, Bell, BarChart2, Bookmark } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { OpportunitySearchPanel } from "@/features/opportunities/components/opportunity-search-panel"
import { OpportunityDailyPanel } from "@/features/opportunities/components/opportunity-daily-panel"
import { OpportunityBenchmarksPanel } from "@/features/opportunities/components/opportunity-benchmarks-panel"
import { OpportunityCollectionsPanel } from "@/features/opportunities/components/opportunity-collections-panel"

const VALID_TABS = new Set(["search", "daily", "benchmarks", "collections"])

export default function OpportunitiesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get("tab") || "search"
  const tab = VALID_TABS.has(rawTab) ? rawTab : "search"

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      {tab === "search" ? (
        <WorkbenchHero
          title="内容机会"
          subtitle="搜索真实内容 → 筛选爆款样本 → 批量拆解 → 形成选题 → 交给 AIM 创作"
          badge={<Badge variant="secondary">抖音 + 视频号</Badge>}
        />
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value === "search" ? "/opportunities" : `/opportunities?tab=${value}`
          router.replace(next)
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="search" className="gap-1.5">
            <Search className="h-3.5 w-3.5" />
            主动搜索
          </TabsTrigger>
          <TabsTrigger value="daily" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            今日机会
          </TabsTrigger>
          <TabsTrigger value="benchmarks" className="gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            对标账号
          </TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            已收藏研究
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <OpportunitySearchPanel />
        </TabsContent>
        <TabsContent value="daily">
          <OpportunityDailyPanel />
        </TabsContent>
        <TabsContent value="benchmarks">
          <OpportunityBenchmarksPanel />
        </TabsContent>
        <TabsContent value="collections">
          <OpportunityCollectionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
