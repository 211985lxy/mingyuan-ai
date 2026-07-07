"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Video, Clock, AlertCircle, Info } from "lucide-react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { listVideoTasks } from "@/lib/api/client"
import type { ApiVideoTask } from "@/types/api"

// ─── Constants ──────────────────────────────────────────

const statusConfig: Record<
  string,
  { label: string; className: string; pulse?: boolean }
> = {
  completed: {
    label: "已完成",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  processing: {
    label: "生成中",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    pulse: true,
  },
  pending: {
    label: "准备中",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    pulse: true,
  },
  queued: {
    label: "等待中",
    className: "bg-blue-100 text-blue-700 border-blue-200",
    pulse: true,
  },
  failed: {
    label: "失败",
    className: "bg-red-100 text-red-700 border-red-200",
  },
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ─── Main Page Component ────────────────────────────────

export default function VideosPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<ApiVideoTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listVideoTasks()
      .then((data) => setTasks(data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <VideosSkeleton />
  }

  return (
    <div className="space-y-8">
      <PageHeader title="我的文案" subtitle="查看已生成的文案与成片记录" />

      {/* Video Grid or Empty State */}
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Video className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">还没有文案</h2>
            <p className="text-sm text-muted-foreground mt-1">
              创建你的第一条 AIM 营销文案吧
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tasks.map((task) => (
            <VideoCard
              key={task.id}
              task={task}
              onClick={() => router.push(`/videos/${task.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Video Card ─────────────────────────────────────────

function VideoCard({
  task,
  onClick,
}: {
  task: ApiVideoTask
  onClick: () => void
}) {
  const status = statusConfig[task.status] ?? statusConfig.pending

  // Enhancement display state (per D-01: UI-01, UI-02, UI-03)
  const showEnhancementProgress =
    task.status === 'completed' && task.enhancementStatus === 'processing';
  const show4kBadge = task.enhancementStatus === 'completed';
  const showEnhancementFailure =
    task.status === 'completed' && task.enhancementStatus === 'failed';

  return (
    <Card
      className="cursor-pointer overflow-hidden transition-colors duration-200 hover:bg-muted/50 group"
      onClick={onClick}
    >
      {/* Thumbnail (3:4 portrait) */}
      <div className="relative aspect-[3/4] bg-muted overflow-hidden">
        {task.coverUrl ? (
          <Image
            src={task.coverUrl}
            alt={`文案成片 ${task.avatarName}`}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="rounded-t-lg object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        {show4kBadge && (
          <Badge className="absolute top-2 left-2 bg-black/80 text-white border-none text-xs px-1.5 py-0.5 font-semibold">
            4K
          </Badge>
        )}
        <Badge
          className={`absolute top-2 right-2 border text-xs ${
            showEnhancementProgress
              ? "bg-purple-100 text-purple-700 border-purple-200 animate-pulse"
              : `${status.className}${status.pulse ? " animate-pulse" : ""}`
          }`}
        >
          {showEnhancementProgress ? "AI优化中" : status.label}
        </Badge>
        {showEnhancementFailure && (
          <Tooltip>
            <TooltipTrigger
              render={<Info className="absolute bottom-2 right-2 h-4 w-4 text-amber-500 cursor-help" />}
            />
            <TooltipContent side="top">
              <p>4K增强未完成，当前为1080p高清版本</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Content */}
      <CardContent className="pt-3 space-y-1.5">
        {/* Script truncated to 2 lines */}
        <p className="text-sm line-clamp-2 leading-relaxed">
          {task.scriptContent}
        </p>

        {/* Error hint for failed tasks */}
        {task.status === "failed" && (
          <div className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-1">点击查看详情并重试</span>
          </div>
        )}

        {/* Footer: avatar name + date */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{task.avatarName}</span>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatDate(task.createdAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Skeleton Loading State ─────────────────────────────

function VideosSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-[3/4] w-full" />
            <CardContent className="pt-3 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
