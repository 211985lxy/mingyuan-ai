"use client"

import { Button } from "@/components/ui/button"
import type { AimRetroListItem } from "@/lib/api/projects"
import { cn } from "@/lib/utils"

function formatMetric(value: number | null | undefined): string {
  return value === null || value === undefined ? "未填写" : String(value)
}

export function AimRetroListItemCard(props: {
  item: AimRetroListItem
  selected: boolean
  expanded: boolean
  onSelect: () => void
  onStartRetro: () => void
  onToggleExpand: () => void
}) {
  const { item, selected, expanded } = props
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2",
        selected ? "border-primary/50 bg-primary/5" : "border-border/60 bg-background/50",
      )}
    >
      <button type="button" className="w-full text-left" onClick={props.onSelect}>
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.platform || "平台未填"}
          {" · "}
          {item.hasOutcome ? `数据窗口 ${item.outcomeWindows.join("/") || "—"} 天` : "尚无结构化数据"}
          {" · "}
          {item.hasRetro ? "已有复盘" : "未复盘"}
        </p>
      </button>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={props.onSelect}>
          {selected ? "已选中" : "选中挂数据"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={props.onStartRetro}>
          开始复盘
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={props.onToggleExpand}>
          {expanded ? "收起追溯" : "追溯"}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
          {item.outcomes.length === 0 ? (
            <p>暂无 ContentOutcome 数字。</p>
          ) : (
            item.outcomes.map((outcome) => (
              <p key={outcome.collectWindowDay}>
                {outcome.collectWindowDay} 天：播放 {formatMetric(outcome.views)}｜点赞 {formatMetric(outcome.likes)}｜评论 {formatMetric(outcome.comments)}｜私信 {formatMetric(outcome.dmCount)}｜线索 {formatMetric(outcome.qualifiedLeadCount)}｜成交 {formatMetric(outcome.dealCount)}
              </p>
            ))
          )}
          {item.latestRetro ? (
            <p>最近复盘：{item.latestRetro.summary || "（无摘要）"}</p>
          ) : (
            <p>尚无复盘快照。</p>
          )}
        </div>
      ) : null}
    </li>
  )
}
