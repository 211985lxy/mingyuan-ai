"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Clapperboard, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { ListSkeleton } from "@/components/ui/skeletons"
import { VoiceHistoryCard } from "@/components/voice/voice-history-card"
import { deleteVideoTask, listVideoTasks, retryVideoTask, retryVideoTaskTransfer } from "@/lib/api/client"
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

/** 行级操作：重试、重试转存、删除（含确认）。与列表加载分离，各自保持可读长度。 */
function useVideoTaskActions(
  setTasks: React.Dispatch<React.SetStateAction<ApiVideoTask[]>>,
) {
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const confirm = useConfirm()

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

  async function handleDelete(id: string, label: string) {
    const ok = await confirm({
      title: `删除任务「${label}」？`,
      description: "只删除这条任务记录；已转存的成片文件不会被删除。",
      confirmText: "删除",
      destructive: true,
    })
    if (!ok) return
    setDeletingId(id)
    try {
      await deleteVideoTask(id)
      setTasks((current) => current.filter((task) => task.id !== id))
      toast.success("已删除该任务记录")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败")
    } finally {
      setDeletingId(null)
    }
  }


  return { retryingId, transferringId, deletingId, handleRetry, handleTransferRetry, handleDelete }
}

/** 成片任务列表状态：加载 / 进行中自动轮询。 */
function useVideoTaskList() {
  const [tasks, setTasks] = useState<ApiVideoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setTasks(await listVideoTasks())
    } catch (error) {
      // 记录失败态：页面主体要显示「读取失败」而非空态，
      // 否则用户会误以为成片都不见了
      setLoadError(error instanceof Error ? error.message : "成片列表加载失败")
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
        .then((rows) => {
          setTasks(rows)
          setLoadError(null)
        })
        .catch(() => {
          /* 轮询失败等下一轮 */
        })
    }, 4000)
    return () => window.clearInterval(timer)
  }, [tasks])

  const actions = useVideoTaskActions(setTasks)
  return { tasks, loading, loadError, refresh, ...actions }
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
          <ListSkeleton rows={3} />
        ) : list.loadError ? (
          <EmptyState
            icon={<AlertTriangle />}
            title="成片列表读取失败"
            description={list.loadError}
            action={
              <Button onClick={() => void list.refresh()}>重新读取</Button>
            }
          />
        ) : list.tasks.length === 0 ? (
          <EmptyState
            icon={<Clapperboard />}
            title="还没有成片任务"
            description="去视频工作台选个公共形象，几分钟就能出第一条片。"
            action={
              <Button nativeButton={false} render={<Link href="/studio/video" />}>
                去视频工作台
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {list.tasks.map((task) => (
              <VideoTaskCard
                key={task.id}
                task={task}
                retrying={list.retryingId === task.id}
                transferring={list.transferringId === task.id}
                deleting={list.deletingId === task.id}
                onRetry={() => void list.handleRetry(task.id)}
                onTransferRetry={() => void list.handleTransferRetry(task.id)}
                onDelete={() => void list.handleDelete(task.id, task.avatarName || "数字人口播")}
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

/** 任务操作区：重试 / 重试转存 / 重新编辑 / 打开成片 / 删除。 */
function VideoTaskActions({
  task,
  retrying,
  transferring,
  deleting,
  onRetry,
  onTransferRetry,
  onDelete,
  onReedit,
}: {
  task: ApiVideoTask
  retrying: boolean
  transferring: boolean
  deleting: boolean
  onRetry: () => void
  onTransferRetry: () => void
  onDelete: () => void
  onReedit: () => void
}) {
  return (
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
        render={<Link href="/studio/video?from=works" onClick={onReedit} />}
      >
        重新编辑
      </Button>
      {task.status === "completed" && task.videoUrl ? (
        <Button size="sm" onClick={() => window.open(task.videoUrl!, "_blank", "noopener,noreferrer")}>
          打开成片
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        aria-label="删除该任务记录"
        disabled={deleting || ["queued", "pending", "processing"].includes(task.status)}
        title={
          ["queued", "pending", "processing"].includes(task.status)
            ? "任务生成中，完成或失败后可删除"
            : "删除任务记录"
        }
        onClick={onDelete}
      >
        {deleting ? "删除中…" : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}

function VideoTaskCard({
  task,
  retrying,
  transferring,
  deleting,
  onRetry,
  onTransferRetry,
  onDelete,
}: {
  task: ApiVideoTask
  retrying: boolean
  transferring: boolean
  deleting: boolean
  onRetry: () => void
  onTransferRetry: () => void
  onDelete: () => void
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
        <VideoTaskActions
          task={task}
          retrying={retrying}
          transferring={transferring}
          deleting={deleting}
          onRetry={onRetry}
          onTransferRetry={onTransferRetry}
          onDelete={onDelete}
          onReedit={handleReedit}
        />
      </CardContent>
    </Card>
  )
}
