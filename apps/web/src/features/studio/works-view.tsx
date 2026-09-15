"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { VoiceHistoryCard } from "@/components/voice/voice-history-card"
import { listVideoTasks, retryVideoTask, retryVideoTaskTransfer } from "@/lib/api/client"
import { saveVideoHandoff } from "@/lib/studio/studio-prefs"
import type { ApiVideoTask } from "@/types/api"

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  pending: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
}

const PENDING_STATUS = ["queued", "pending", "processing"]

/** 成片任务列表状态：加载 / 重试 / 转存重试 / 进行中自动轮询。 */
function useVideoTaskList() {
  const [tasks, setTasks] = useState<ApiVideoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTasks(await listVideoTasks())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "成片列表加载失败")
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])

  // 有进行中任务时自动轮询；全部到终态即停
  useEffect(() => {
    const hasPending = tasks.some((task) => PENDING_STATUS.includes(task.status))
    if (!hasPending) return
    const timer = window.setInterval(() => {
      void listVideoTasks()
        .then(setTasks)
        .catch(() => {
          /* 轮询失败等下一轮 */
        })
    }, 4000)
    return () => window.clearInterval(timer)
  }, [tasks])

  async function handleRetry(id: string) {
    setRetryingId(id)
    try {
      const next = await retryVideoTask(id)
      setTasks((current) => [next, ...current.filter((task) => task.id !== next.id)])
      toast.success("已重新提交生成，仍沿用原供应商")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重试失败")
    } finally {
      setRetryingId(null)
    }
  }

  async function handleTransferRetry(id: string) {
    setTransferringId(id)
    try {
      const next = await retryVideoTaskTransfer(id)
      setTasks((current) => current.map((task) => task.id === next.id ? next : task))
      toast.success(next.deliveryStatus === "durable" ? "成片已转存到 AIM" : "转存仍未完成，请稍后再试")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "转存重试失败")
    } finally {
      setTransferringId(null)
    }
  }

  return { tasks, loading, retryingId, transferringId, handleRetry, handleTransferRetry }
}

/** 作品页：数字人成片任务 + 配音历史。进行中任务自动轮询。 */
export function WorksView() {
  const list = useVideoTaskList()

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">作品</h1>
          <p className="text-sm text-muted-foreground">数字人成片任务与配音历史都在这里，失败可一键重试。</p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/studio/video" />}>
          再去出一条片
        </Button>
      </header>

      <section className="space-y-3">
        <p className="text-sm font-medium text-foreground/85">数字人成片</p>
        {list.loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : list.tasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
              <p>还没有成片任务。</p>
              <p>
                去<Link className="text-primary underline-offset-2 hover:underline" href="/studio/video">视频工作台</Link>选个公共形象，几分钟出第一条片。
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {list.tasks.map((task) => (
              <VideoTaskCard
                key={task.id}
                task={task}
                retrying={list.retryingId === task.id}
                transferring={list.transferringId === task.id}
                onRetry={() => void list.handleRetry(task.id)}
                onTransferRetry={() => void list.handleTransferRetry(task.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium text-foreground/85">配音历史</p>
        <VoiceHistoryCard refreshKey={0} />
      </section>
    </div>
  )
}

function VideoTaskCard({
  task,
  retrying,
  transferring,
  onRetry,
  onTransferRetry,
}: {
  task: ApiVideoTask
  retrying: boolean
  transferring: boolean
  onRetry: () => void
  onTransferRetry: () => void
}) {
  // 重新编辑：文案与项目带回视频工作台，改一处再出片
  function handleReedit() {
    saveVideoHandoff({ script: task.scriptContent, projectId: task.projectId ?? undefined })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{task.avatarName || "数字人口播"}</p>
            <Badge variant="secondary">{STATUS_LABEL[task.status] ?? task.status}</Badge>
            <Badge variant="outline">{task.provider === "shanjian" ? "闪剪备用" : "蝉镜"}</Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{task.scriptContent}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(task.createdAt).toLocaleString("zh-CN")}
            {task.errorMessage ? ` · ${task.errorMessage}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {task.status === "failed" ? (
            <Button size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
              {retrying ? "提交中…" : "重试"}
            </Button>
          ) : null}
          {task.status === "completed" && task.deliveryStatus === "degraded" ? (
            <Button size="sm" variant="outline" disabled={transferring} onClick={onTransferRetry}>
              {transferring ? "转存中…" : "重试转存"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/studio/video?from=works" onClick={handleReedit} />}
          >
            重新编辑
          </Button>
          {task.status === "completed" && task.videoUrl ? (
            <Button size="sm" onClick={() => window.open(task.videoUrl!, "_blank", "noopener,noreferrer")}>
              打开成片
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
