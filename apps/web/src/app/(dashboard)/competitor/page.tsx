"use client"

import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { CompetitorWorkbench } from "@/features/competitor/components/competitor-workbench"

export default function CompetitorWatchPage() {
  return (
    <div className="mx-auto max-w-6xl pb-10">
      <WorkbenchHero
        title="竞品监控"
        subtitle="添加对标账号，刷作品池，沉淀爆款证据"
      />
      <div className="mt-4">
        <CompetitorWorkbench />
      </div>
    </div>
  )
}
