"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Download,
  Copy,
  Video,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Check,
  Sparkles,
  TrendingUp,
  Target,
  MessageSquare,
  Heart,
  Star,
  Send,
  Hash,
  ExternalLink,
  RotateCcw,
  Clock,
  Loader2 as Loader2Icon,
  Info,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ApiError,
  getVideoTask,
  getVideoTaskRetryPayload,
  createVideoTask,
} from "@/lib/api/client"
import { toast } from "sonner"
import type { ApiVideoTask, MarketingAnalysisData } from "@/types/api"

// ─── Helpers ────────────────────────────────────────────

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const DEFAULT_PUBLISH_TAGS = ["营销干货", "短视频运营", "小企业主"]

function normalizeTag(tag: string): string {
  return tag.replace(/^#+|#+$/g, "").trim()
}

function buildPublishTags(task: ApiVideoTask): string[] {
  const tags = new Set<string>()

  for (const tag of task.sourceTemplateTags ?? []) {
    const normalized = normalizeTag(tag)
    if (normalized) {
      tags.add(normalized)
    }
  }

  if (task.hotTopic) {
    const normalized = normalizeTag(task.hotTopic)
    if (normalized) {
      tags.add(normalized)
    }
  }

  for (const tag of DEFAULT_PUBLISH_TAGS) {
    if (tags.size >= 6) break
    tags.add(tag)
  }

  return [...tags].slice(0, 6)
}

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

  const analysis: MarketingAnalysisData | null = task.marketingAnalysis ?? null
  const analysisLoading =
    task.status === "completed" && !!task.videoUrl && !task.marketingAnalysis
  const publishInfo =
    task.status === "completed" && task.videoUrl
      ? {
          title: `${task.scriptContent.slice(0, 20)}...｜${task.avatarName}带你了解`,
          description: task.scriptContent,
          tags: buildPublishTags(task),
        }
      : null
  const publishLoading = false

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

  const publishTagsText = publishInfo
    ? publishInfo.tags.map((t) => `#${t}#`).join(" ")
    : ""

  return (
    <div className="space-y-8">
      <PageHeader title="文案成片预览" backHref="/videos">
        <div className="flex items-center gap-2">
          {task.enhancementStatus === 'completed' && (
            <Badge className="bg-black/80 text-white border-none text-xs px-2 py-0.5 font-semibold">
              4K
            </Badge>
          )}
          {task.enhancementStatus === 'processing' && (
            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs animate-pulse">
              AI优化中
            </Badge>
          )}
          {task.enhancementStatus === 'failed' && (
            <Tooltip>
              <TooltipTrigger render={<Info className="h-4 w-4 text-amber-500 cursor-help" />} />
              <TooltipContent side="right">
                <p>4K增强未完成，当前为1080p高清版本</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </PageHeader>

      {/* Two-column: Video (left) + AI Analysis (right) */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Video Player + Actions */}
        <div className="w-full lg:w-[320px] xl:w-[360px] shrink-0 space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <video
                src={(task.enhanced4kUrl || task.videoUrl) ?? undefined}
                controls
                preload="metadata"
                className="w-full rounded-lg aspect-[9/16] bg-black object-contain"
                aria-label="视频预览播放器"
              />
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const bestUrl = task.enhanced4kUrl || task.videoUrl
                if (bestUrl) window.open(bestUrl, "_blank")
              }}
              className="cursor-pointer transition-colors duration-200 flex-1"
            >
              <Download className="h-4 w-4 mr-1.5" />
              下载
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="cursor-pointer transition-colors duration-200 flex-1"
            >
              {copied ? (
                <Check className="h-4 w-4 mr-1.5 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 mr-1.5" />
              )}
              {copied ? "已复制" : "复制文案"}
            </Button>

            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer transition-colors duration-200 flex-1"
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    发布
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>选择发布平台</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  选择平台后将跳转到对应的创作者中心，您可以直接上传视频并发布。
                </p>
                <div className="grid gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        "https://channels.weixin.qq.com/platform/post/create",
                        "_blank"
                      )
                    }
                    className="flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors duration-200 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                        <Video className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium">视频号</p>
                        <p className="text-xs text-muted-foreground">
                          微信视频号创作者中心
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        "https://creator.xiaohongshu.com/publish/publish",
                        "_blank"
                      )
                    }
                    className="flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors duration-200 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                        <Star className="h-5 w-5 text-red-500" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium">小红书</p>
                        <p className="text-xs text-muted-foreground">
                          小红书创作者中心
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  发布前记得复制下方的标题和话题标签
                </p>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Right: AI Marketing Analysis */}
        <div className="flex-1 min-w-0">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI 营销分析
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {analysisLoading ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-20 w-20 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : analysis ? (
                <>
                  {/* Overall Score + Summary */}
                  <div className="flex items-start gap-5">
                    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                      <span className="text-3xl font-bold text-primary">
                        {analysis.overallScore}
                      </span>
                      <div className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background">
                        <Sparkles className="h-4.5 w-4.5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-lg font-semibold">
                        营销评分：
                        {analysis.overallScore >= 85
                          ? "优秀"
                          : analysis.overallScore >= 75
                            ? "良好"
                            : "及格"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        {analysis.summary}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Dimension scores */}
                  <div className="space-y-4">
                    <p className="text-sm font-medium">维度评分</p>
                    {analysis.dimensions.map((dim) => {
                      const DimIcon = dim.name.includes("吸引")
                        ? Target
                        : dim.name.includes("说服")
                          ? MessageSquare
                          : dim.name.includes("行动")
                            ? TrendingUp
                            : dim.name.includes("品牌")
                              ? Star
                              : Heart
                      return (
                        <div key={dim.name} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DimIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                {dim.name}
                              </span>
                            </div>
                            <span className="text-sm font-bold text-primary">
                              {Math.min(dim.score, 100)}
                            </span>
                          </div>
                          <Progress value={Math.min(dim.score, 100)} />
                          <p className="text-xs text-muted-foreground">
                            {dim.comment}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Publish Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            发布信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {publishLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-8 w-64" />
            </div>
          ) : publishInfo ? (
            <>
              {/* Title */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    推荐标题
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      handleCopyField(publishInfo.title, "title")
                    }
                    className="cursor-pointer transition-colors duration-200"
                  >
                    {copiedField === "title" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">
                      {copiedField === "title" ? "已复制" : "复制"}
                    </span>
                  </Button>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm font-medium">{publishInfo.title}</p>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    发布文案
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      handleCopyField(publishInfo.description, "desc")
                    }
                    className="cursor-pointer transition-colors duration-200"
                  >
                    {copiedField === "desc" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">
                      {copiedField === "desc" ? "已复制" : "复制"}
                    </span>
                  </Button>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm leading-relaxed line-clamp-3">
                    {publishInfo.description}
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    推荐话题
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleCopyField(publishTagsText, "tags")}
                    className="cursor-pointer transition-colors duration-200"
                  >
                    {copiedField === "tags" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">
                      {copiedField === "tags" ? "已复制" : "全部复制"}
                    </span>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {publishInfo.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer transition-colors duration-200 hover:bg-primary/10"
                      onClick={() => handleCopyField(`#${tag}#`, `tag-${tag}`)}
                    >
                      <Hash className="h-3 w-3 mr-0.5" />
                      {tag}
                      {copiedField === `tag-${tag}` && (
                        <Check className="h-3 w-3 ml-1 text-green-600" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">文案信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">数字人</p>
              <p className="font-medium">{task.avatarName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">创建时间</p>
              <p className="font-medium">{formatDate(task.createdAt)}</p>
            </div>
            {task.completedAt && (
              <div className="space-y-1">
                <p className="text-muted-foreground">完成时间</p>
                <p className="font-medium">{formatDate(task.completedAt)}</p>
              </div>
            )}
            {task.enhancementStatus && task.enhancementStatus !== 'none' && (
              <div className="space-y-1">
                <p className="text-muted-foreground">画质</p>
                <p className="font-medium">
                  {task.enhancementStatus === 'completed' ? '4K超清' :
                   task.enhancementStatus === 'processing' ? 'AI优化中...' :
                   task.enhancementStatus === 'failed' ? '1080p高清' :
                   '1080p高清'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
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
