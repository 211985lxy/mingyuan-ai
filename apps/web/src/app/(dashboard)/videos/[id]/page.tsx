"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Video,
  Loader2,
  AlertCircle,
  ArrowLeft,
  RotateCcw,
  Clock,
  Loader2 as Loader2Icon,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { VideoCompletedView } from "@/features/videos/components/video-completed-view"
import {
  ApiError,
  getVideoTask,
  getVideoTaskRetryPayload,
  createVideoTask,
} from "@/lib/api/client"
import { toast } from "sonner"
import type { ApiVideoTask } from "@/types/api"

// ─── Main Page Component ────────────────────────────────

export default function VideoDetailPage() {
  const params = useParams() ?? {}
  const router = useRouter()
  const id = params.id as string

  const [task, setTask] = useState<ApiVideoTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const taskStatus = task?.status

  // Initial fetch
  useEffect(() => {
    getVideoTask(id)
      .then((data) => setTask(data))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true)
          return
        }
        throw error
      })
      .finally(() => setLoading(false))
  }, [id])

  // Polling for active states (queued at 10s, processing/pending at 3s)
  useEffect(() => {
    if (!taskStatus || !["processing", "pending", "queued"].includes(taskStatus)) {
      return
    }

    // queued tasks change less frequently — poll slower to reduce load
    const interval = taskStatus === "queued" ? 10000 : 3000

    pollRef.current = setInterval(async () => {
      try {
        const updated = await getVideoTask(id)
        setTask(updated)

        if (updated.status === "completed" || updated.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }
    }, interval)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [taskStatus, id])

  // Poll for analysis if not yet available
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (task?.status !== "completed" || !task.videoUrl || task.marketingAnalysis) {
      return
    }

    analysisPollRef.current = setInterval(async () => {
      try {
        const updated = await getVideoTask(id)
        if (updated.marketingAnalysis) {
          setTask(updated)
          if (analysisPollRef.current) clearInterval(analysisPollRef.current)
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true)
          if (analysisPollRef.current) clearInterval(analysisPollRef.current)
        }
      }
    }, 5000)

    return () => {
      if (analysisPollRef.current) clearInterval(analysisPollRef.current)
    }
  }, [task?.status, task?.videoUrl, task?.marketingAnalysis, id])

  // Poll for enhancement status changes
  const enhancementPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const enhancementStatus = task?.enhancementStatus

  useEffect(() => {
    if (!enhancementStatus || !['pending', 'processing'].includes(enhancementStatus)) {
      return
    }

    enhancementPollRef.current = setInterval(async () => {
      try {
        const updated = await getVideoTask(id)
        setTask(updated)

        if (
          !updated.enhancementStatus ||
          updated.enhancementStatus === 'completed' ||
          updated.enhancementStatus === 'failed' ||
          updated.enhancementStatus === 'none'
        ) {
          if (enhancementPollRef.current) clearInterval(enhancementPollRef.current)
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          if (enhancementPollRef.current) clearInterval(enhancementPollRef.current)
        }
      }
    }, 5000)

    return () => {
      if (enhancementPollRef.current) clearInterval(enhancementPollRef.current)
    }
  }, [enhancementStatus, id])

  // Copy handler for script
  function handleCopy() {
    if (!task?.scriptContent) return
    navigator.clipboard.writeText(task.scriptContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Copy handler for publish fields
  const handleCopyField = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }, [])

  // ─── Loading ────────────────────────────────────────────

  if (loading) {
    return <DetailSkeleton />
  }

  // ─── Not Found ──────────────────────────────────────────

  if (notFound || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Video className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">文案记录不存在</h2>
        <p className="text-sm text-muted-foreground">
          找不到该文案记录，可能已被删除
        </p>
        <Button
          variant="outline"
          onClick={() => router.push("/videos")}
          className="cursor-pointer transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回文案列表
        </Button>
      </div>
    )
  }

  // ─── Queued State ───────────────────────────────────────

  if (task.status === "queued") {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/videos")}
          className="mb-6 cursor-pointer transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回文案列表
        </Button>

        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Clock className="h-8 w-8 text-blue-600" />
          </div>

          <div>
            <h2 className="text-xl font-bold">等待处理中</h2>
            <p className="text-sm text-muted-foreground mt-1">
              当前使用人数较多，您的任务已排队，通常几分钟内会开始生成
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            状态变化后将自动刷新，您也可以先去做其他事情
          </p>
        </div>
      </div>
    )
  }

  // ─── Processing State ───────────────────────────────────

  if (task.status === "processing" || task.status === "pending") {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/videos")}
          className="mb-6 cursor-pointer transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回文案列表
        </Button>

        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-muted" />
            <Loader2 className="absolute inset-0 h-16 w-16 text-primary animate-spin" />
          </div>

          <div>
            <h2 className="text-xl font-bold">文案成片生成中...</h2>
            <p className="text-sm text-muted-foreground mt-1">
              请稍候，正在为这条文案生成成片
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            完成后将自动刷新页面
          </p>
        </div>
      </div>
    )
  }

  // ─── Retry handler ──────────────────────────────────────

  async function handleRetryVideoTask() {
    setRetrying(true)
    try {
      const { retryPayload } = await getVideoTaskRetryPayload(id)
      const newTask = await createVideoTask(retryPayload)
      toast.success("已重新提交文案成片任务")
      router.push(`/videos/${newTask.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重试失败，请稍后再试")
    } finally {
      setRetrying(false)
    }
  }

  // ─── Failed State ───────────────────────────────────────

  if (task.status === "failed") {
    // Map common error codes/messages to user-friendly guidance
    const errorMessage = task.errorMessage ?? "未知错误"
    const friendlyHint = errorMessage.includes("timeout") || errorMessage.includes("超时")
      ? "文案成片服务响应超时，通常重试即可解决。"
      : errorMessage.includes("quota") || errorMessage.includes("余额")
        ? "服务额度不足，请联系管理员。"
        : "这可能是临时性问题，建议点击重试。如果反复失败，请检查素材质量或联系客服。"

    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/videos")}
          className="mb-6 cursor-pointer transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回文案列表
        </Button>

        <Card className="border-red-200">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-600" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold">生成失败</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {friendlyHint}
              </p>
              {task.errorCode && (
                <p className="text-xs text-muted-foreground/60">
                  错误码: {task.errorCode}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleRetryVideoTask}
                disabled={retrying}
                className="cursor-pointer transition-colors duration-200"
              >
                {retrying ? (
                  <><Loader2Icon className="h-4 w-4 animate-spin mr-1.5" />重试中...</>
                ) : (
                  <><RotateCcw className="h-4 w-4 mr-1.5" />重新生成</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/create")}
                className="cursor-pointer transition-colors duration-200"
              >
                重新创建
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Completed but no video (edge case) ─────────────────

  if (task.status === "completed" && !task.videoUrl) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/videos")}
          className="mb-6 cursor-pointer transition-colors duration-200"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回文案列表
        </Button>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="text-xl font-bold">文案成片数据异常</h2>
              <p className="text-sm text-muted-foreground mt-1">
                文案已标记完成但未找到成片文件，请联系管理员
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Completed State ────────────────────────────────────

  return (
    <VideoCompletedView
      task={task}
      copied={copied}
      copiedField={copiedField}
      onCopyScript={handleCopy}
      onCopyField={handleCopyField}
    />
  )
}

// ─── Skeleton Loading State ─────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-8 w-32" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-[320px] xl:w-[360px] shrink-0 space-y-4">
          <Skeleton className="aspect-[9/16] w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <Card className="h-full">
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
