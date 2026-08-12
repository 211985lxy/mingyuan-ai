"use client"

import { Button } from "@/components/ui/button"
import type { WeeklyContentBoardItem } from "@/lib/aim/weekly-content-board"

const ACTION_LABELS: Record<WeeklyContentBoardItem["nextAction"], string> = {
  start_writing: "开始创作",
  continue_editing: "继续修改",
  review_publish: "审核发布",
  fill_results: "填写结果",
}

export function buildWeeklyContentHref(projectId: string, item: WeeklyContentBoardItem): string {
  const params = new URLSearchParams({ projectId, stage: item.stage })
  if (item.generationId) params.set("generationId", item.generationId)
  else {
    params.set("topicSelectionId", item.topicSelectionId)
    params.set("selectedTopicIndex", String(item.candidateIndex))
    params.set("topicTitle", item.title)
  }
  return `/aim?${params.toString()}`
}

export function WeeklyContentBoard(props: {
  projectId: string
  items: WeeklyContentBoardItem[]
  onOpen: (href: string) => void
}) {
  return (
    <section aria-label="本周内容" className="space-y-2">
      {props.items.map((item) => (
        <article key={item.key} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium">{item.title}</h3>
            {item.sourceSummary ? <p className="truncate text-xs text-muted-foreground">{item.sourceSummary}</p> : null}
          </div>
          <Button size="sm" onClick={() => props.onOpen(buildWeeklyContentHref(props.projectId, item))}>
            {ACTION_LABELS[item.nextAction]}
          </Button>
        </article>
      ))}
    </section>
  )
}
