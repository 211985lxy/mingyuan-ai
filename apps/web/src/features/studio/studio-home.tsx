"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, AudioLines, Clapperboard, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchVoiceHistory, type VoiceHistoryItem } from "@/lib/api/voice"
import { listVideoTasks } from "@/lib/api/media"
import type { ApiVideoTask } from "@/types/api"

const TASK_STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  pending: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
}

type ContinueItem =
  | { kind: "video"; task: ApiVideoTask }
  | { kind: "audio"; item: VoiceHistoryItem }

/** 「继续上次」数据：最近成片任务 + 配音历史按时间混排。 */
function useRecentWorks() {
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState<ContinueItem[]>([])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 进页面进入加载态
    setLoading(true)
    void Promise.allSettled([listVideoTasks(), fetchVoiceHistory(1, 3)]).then(([tasks, voices]) => {
      if (cancelled) return
      const items: ContinueItem[] = []
      if (tasks.status === "fulfilled") {
        for (const task of tasks.value.slice(0, 3)) items.push({ kind: "video", task })
      }
      if (voices.status === "fulfilled") {
        for (const item of voices.value.items.slice(0, 2)) items.push({ kind: "audio", item })
      }
      items.sort((a, b) => {
        const at = a.kind === "video" ? a.task.createdAt : a.item.createdAt
        const bt = b.kind === "video" ? b.task.createdAt : b.item.createdAt
        return new Date(bt).getTime() - new Date(at).getTime()
      })
      setRecent(items.slice(0, 4))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { loading, recent }
}

/** 工坊首页：两张大卡 = 唯二入口；「继续上次」直达最近的成品与进行中任务。 */
export function StudioHome() {
  const { loading, recent } = useRecentWorks()

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">今天要做什么？</h1>
        <p className="text-sm text-muted-foreground">选一种模式，跟着三步走，几分钟出成品。</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        {modeCard(
          "/studio/audio",
          <AudioLines className="h-5 w-5" />,
          "音频数字人",
          "文案变成有声配音，先听顺不顺耳",
          "约 30 秒出品",
        )}
        {modeCard(
          "/studio/video",
          <Clapperboard className="h-5 w-5" />,
          "视频数字人",
          "选一个形象开口说话，直接出成片",
          "几分钟出成片",
        )}
      </div>

      <ContinueSection loading={loading} recent={recent} />
    </div>
  )
}

function ContinueSection({ loading, recent }: { loading: boolean; recent: ContinueItem[] }) {
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-foreground/85">继续上次</p>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          读取最近的成果…
        </p>
      ) : recent.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            还没有作品。第一次使用？直接选上面的「视频数字人」，用公共形象就能当天出片。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recent.map((entry) =>
            entry.kind === "video" ? (
              <VideoContinueRow key={`video-${entry.task.id}`} task={entry.task} />
            ) : (
              <AudioContinueRow key={`audio-${entry.item.id}`} item={entry.item} />
            ),
          )}
          <div className="pt-1 text-right">
            <Link href="/studio/works" className="text-xs text-primary underline-offset-2 hover:underline">
              全部作品 →
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

function VideoContinueRow({ task }: { task: ApiVideoTask }) {
  return (
    <ContinueRow
      icon={<Clapperboard className="h-4 w-4" />}
      title={task.avatarName || "数字人口播"}
      meta={new Date(task.createdAt).toLocaleString("zh-CN")}
      status={
        <Badge variant={task.status === "failed" ? "destructive" : "secondary"}>
          {TASK_STATUS_LABEL[task.status] ?? task.status}
        </Badge>
      }
      action={
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/studio/works" />}>
          查看进度
        </Button>
      }
    />
  )
}

function AudioContinueRow({ item }: { item: VoiceHistoryItem }) {
  return (
    <ContinueRow
      icon={<AudioLines className="h-4 w-4" />}
      title={item.textPreview || "配音作品"}
      meta={new Date(item.createdAt).toLocaleString("zh-CN")}
      status={<Badge variant="secondary">已完成</Badge>}
      action={
        item.audioUrl ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href={item.audioUrl} target="_blank" rel="noreferrer" />}
          >
            播放
          </Button>
        ) : null
      }
    />
  )
}

function modeCard(href: string, icon: React.ReactNode, title: string, desc: string, eta: string) {
  return (
    <Link href={href} className="group block flex-1">
      <Card interactive className="h-full">
        <CardContent className="flex h-full flex-col gap-3 py-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/[0.14]">
            {icon}
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
          <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
            {eta}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

function ContinueRow({
  icon,
  title,
  meta,
  status,
  action,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  status: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status}
        {action}
      </div>
    </div>
  )
}
