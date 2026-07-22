"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BarChart2 } from "lucide-react"

/** 对标账号面板 — 复用现有竞品研究的账号监控能力 */
export function OpportunityBenchmarksPanel() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">对标账号监控</p>
        <p className="mt-1 text-xs text-muted-foreground">
          监控同行账号的最新动态和爆款内容，发现可借鉴的内容策略。
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/competitor">前往竞品研究（旧版）</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
