"use client"

import Link from "next/link"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ApiVideoTask } from "@/types/api"

const TASK_STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  pending: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
}

/** Step 3 出成片：默认即最优（竖屏），一次确认即提交；提交后任务后台化。 */
export function VideoReviewStep(props: {
  avatarLabel: string
  voiceLabel: string
  scriptPreview: string
  speechSeconds: number
  aspectRatio: "9:16" | "16:9"
  onAspectRatioChange: (value: "9:16" | "16:9") => void
  naturalMotion: boolean
  onNaturalMotionChange: (value: boolean) => void
  submitting: boolean
  task: ApiVideoTask | null
  onSubmit: () => void
  onBack: () => void
}) {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">确认并出片</h2>
        <p className="text-sm text-muted-foreground">生成需要几十秒到几分钟，提交后可离开，完成后在「作品」查看。</p>
      </header>

      <Card>
        <CardContent className="space-y-4 py-5">
          <SummaryBlock
            avatarLabel={props.avatarLabel}
            voiceLabel={props.voiceLabel}
            scriptPreview={props.scriptPreview}
            speechSeconds={props.speechSeconds}
          />

          <AspectRatioPicker value={props.aspectRatio} onChange={props.onAspectRatioChange} />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">动作</span>
            <Button
              type="button"
              size="sm"
              variant={props.naturalMotion ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => props.onNaturalMotionChange(true)}
            >
              自然（随机帧）
            </Button>
            <Button
              type="button"
              size="sm"
              variant={props.naturalMotion ? "ghost" : "secondary"}
              className="h-7 px-2 text-xs"
              onClick={() => props.onNaturalMotionChange(false)}
            >
              顺序播放
            </Button>
          </div>

          {props.task ? <TaskStatusCard task={props.task} /> : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={props.onBack} disabled={Boolean(props.task)}>
          上一步
        </Button>
        <Button type="button" disabled={props.submitting || Boolean(props.task)} onClick={props.onSubmit}>
          {props.submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {props.task ? "任务已提交" : "生成成片"}
        </Button>
      </div>
    </section>
  )
}

function SummaryBlock({
  avatarLabel,
  voiceLabel,
  scriptPreview,
  speechSeconds,
}: {
  avatarLabel: string
  voiceLabel: string
  scriptPreview: string
  speechSeconds: number
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">形象</span>
        <span className="font-medium">{avatarLabel}</span>
        <span className="mx-2 text-border">|</span>
        <span className="text-muted-foreground">声音</span>
        <span className="font-medium">{voiceLabel}</span>
      </p>
      <p className="line-clamp-2 text-muted-foreground">「{scriptPreview}」</p>
      <p className="text-xs text-muted-foreground">约 {speechSeconds} 秒成片</p>
    </div>
  )
}

function AspectRatioPicker({
  value,
  onChange,
}: {
  value: "9:16" | "16:9"
  onChange: (value: "9:16" | "16:9") => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">画面</span>
      <Button
        type="button"
        size="sm"
        variant={value === "9:16" ? "secondary" : "ghost"}
        className="h-7 px-2 text-xs"
        onClick={() => onChange("9:16")}
      >
        9:16 竖屏
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "16:9" ? "secondary" : "ghost"}
        className="h-7 px-2 text-xs"
        onClick={() => onChange("16:9")}
      >
        16:9 横屏
      </Button>
    </div>
  )
}

function TaskStatusCard({ task }: { task: ApiVideoTask }) {
  const pending = ["pending", "queued", "processing"].includes(task.status)
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">任务状态</span>
        <Badge variant={task.status === "failed" ? "destructive" : "secondary"}>
          {TASK_STATUS_LABEL[task.status] ?? task.status}
        </Badge>
      </div>
      {pending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          生成中，页面会自动刷新；也可以直接去「作品」页。
        </p>
      ) : null}
      {task.status === "failed" ? (
        <p className="text-destructive">{task.errorMessage || "生成失败，可在「作品」页重试"}</p>
      ) : null}
      {task.status === "completed" && task.videoUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>成片已就绪。</span>
          <Button size="sm" onClick={() => window.open(task.videoUrl!, "_blank", "noopener,noreferrer")}>
            打开成片
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/studio/works" />}>
            去作品页
          </Button>
        </div>
      ) : null}
    </div>
  )
}
