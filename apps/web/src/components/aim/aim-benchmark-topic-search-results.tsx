"use client"

import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { OpportunityItem, OpportunityPlatform } from "@/features/opportunities/contracts/types"
import { formatOpportunityMetric } from "@/features/opportunities/lib/opportunity-collection-client"

const PLATFORM_LABELS: Record<OpportunityPlatform, string> = {
  douyin: "抖音",
  wechat_channels: "视频号",
}

export function AimBenchmarkTopicSearchResults(props: {
  items: OpportunityItem[]
  busyKey: string | null
  onSave: (item: OpportunityItem) => void
  onWrite: (item: OpportunityItem) => void
}) {
  if (props.items.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        复用市场洞察同一套搜索。搜到后可收藏进研究篮，或一键转成写稿事项。
      </p>
    )
  }

  return (
    <ul className="max-h-56 space-y-1.5 overflow-y-auto">
      {props.items.map((item) => {
        const rowKey = `${item.platform}-${item.sourceId}`
        return (
          <li key={rowKey} className="rounded-lg border border-border/50 bg-background/80 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                    {PLATFORM_LABELS[item.platform]}
                  </Badge>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs font-medium text-foreground hover:underline"
                  >
                    {item.title || "无标题"}
                  </a>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.author.name}
                  {item.metrics.likes != null ? ` · 赞 ${formatOpportunityMetric(item.metrics.likes)}` : ""}
                  {item.opportunityScore != null
                    ? ` · 机会分 ${Math.round(item.opportunityScore * 100)}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  disabled={props.busyKey !== null}
                  onClick={() => props.onSave(item)}
                >
                  {props.busyKey === `${rowKey}:save` ? <Loader2 className="size-3 animate-spin" /> : "收藏"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={props.busyKey !== null}
                  onClick={() => props.onWrite(item)}
                >
                  {props.busyKey === `${rowKey}:write` ? <Loader2 className="size-3 animate-spin" /> : "写稿"}
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
