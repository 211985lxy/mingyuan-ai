"use client"

import { Badge } from "@/components/ui/badge"
import type { NewsroomStage, NewsroomRunState } from "@/features/newsroom/contracts"

const STAGE_LABEL: Record<string, string> = {
  searching: "搜",
  writing_ready: "待写",
  writing: "写",
  editing: "改",
  done: "完成",
  failed: "失败",
}

const PIPELINE: Array<NewsroomStage | NewsroomRunState> = [
  "writing_ready",
  "writing",
  "editing",
  "done",
]

/**
 * 编辑室阶段条（独立于 workflowStatus）
 */
export function NewsroomStageStrip(props: {
  stage?: NewsroomStage | NewsroomRunState | string | null
  sourceCount?: number
}) {
  if (!props.stage) return null
  const current = props.stage
  if (current === "failed") {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <Badge variant="destructive">编辑室失败</Badge>
        <span>可在研究篮重试「交给编辑室」</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">编辑室</span>
      {PIPELINE.map((step, index) => {
        const active = step === current
        const passed = PIPELINE.indexOf(current as typeof step) > index
        return (
          <Badge
            key={step}
            variant={active ? "default" : passed ? "secondary" : "outline"}
            className="text-[11px]"
          >
            {STAGE_LABEL[step] || step}
          </Badge>
        )
      })}
      {props.sourceCount != null ? <span>样本 {props.sourceCount}</span> : null}
    </div>
  )
}
