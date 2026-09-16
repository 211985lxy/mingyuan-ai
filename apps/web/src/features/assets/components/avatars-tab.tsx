"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

/**
 * 资产库的数字人 tab 已迁入数字人工坊素材库（2026-09-14 设计方案 Phase 2）。
 * 本组件仅保留提示跳转，一个版本后随资产库 tab 一起移除。
 */
export function AvatarsTab() {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 py-12 text-center text-sm text-muted-foreground">
        <p>数字人管理已迁入「数字人工坊 · 素材库」，这里的克隆与重试功能不再维护。</p>
        <p>
          <Link
            href="/studio/library"
            className="text-primary underline-offset-2 hover:underline"
          >
            前往工坊素材库 →
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
