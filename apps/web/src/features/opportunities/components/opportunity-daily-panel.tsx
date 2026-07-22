"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Bell } from "lucide-react"

/** 今日机会面板 — 复用现有热点能力，第二阶段接入每日自动搜索 */
export function OpportunityDailyPanel() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Bell className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">今日机会推荐</p>
        <p className="mt-1 text-xs text-muted-foreground">
          基于已保存的搜索条件，每日自动发现新爆款内容。即将上线。
        </p>
      </CardContent>
    </Card>
  )
}
