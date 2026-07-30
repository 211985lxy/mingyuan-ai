"use client"

import {
  useEffect,
  useState,
} from "react"
import Link from "next/link"
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Video,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { VideoCopyAnalysisCards } from "@/components/video-copy-analysis-cards"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import {
  createVideoCopyExtraction,
  listVideoCopyExtractions,
  syncVideoCopyExtraction,
} from "@/lib/api/client"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import type { ApiVideoCopyExtraction } from "@/types/api"

const ACTIVE_STATUSES = new Set(["queued", "extracting", "analyzing"])

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    douyin: "抖音",
    bilibili: "B站",
    kuaishou: "快手",
    xiaohongshu: "小红书",
    youtube: "YouTube",
    unknown: "未知平台",
  }
  return labels[platform] ?? platform
}

function statusLabel(record: ApiVideoCopyExtraction | null) {
  if (!record) return "待提交"
  if (record.status === "queued" || record.status === "extracting") return "提取中"
  if (record.status === "analyzing") return "分析中"
  if (record.status === "completed" && record.analysisError) return "文案已提取"
  if (record.status === "completed") return "已完成"
  if (record.status === "failed") return "提取失败"
  return "处理中"
}

async function copyText(text: string, message: string) {
  await navigator.clipboard.writeText(text)
  toast.success(message)
}

export default function VideoCopyPage() {
  const [url, setUrl] = useState("")
  const [record, setRecord] = useState<ApiVideoCopyExtraction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  const rewriteHref = record
    ? `/aim?agent=content_producer&mode=quick&videoCopyExtractionId=${record.id}`
    : "/aim?mode=quick&stage=content"
  const [history, setHistory] = useState<ApiVideoCopyExtraction[]>([])

  const isActive = record ? ACTIVE_STATUSES.has(record.status) : false
  const analysis = record?.analysisResult as { markdown: string; topComments?: Array<{ text: string; likes: number; isTop: boolean }> } | null | undefined
const topComments = analysis?.topComments ?? []
  const activeRecordId = record?.id
  const activeRecordStatus = record?.status
  const activeRecordUpdatedAt = record?.updatedAt

  async function submit() {
    const trimmed = url.trim()
    if (!trimmed) {
      toast.error("请先粘贴视频链接")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const next = await createVideoCopyExtraction(trimmed)
      setRecord(next)
      setHistory((items) => [next, ...items.filter((item) => item.id !== next.id)].slice(0, 10))
      setCoverFailed(false)
      if (next.status === "failed") {
        setError(next.errorMessage ?? "文案提取失败，请稍后重试。")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "提交失败，请稍后重试。"
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function sync(id: string) {
    setSyncing(true)
    setError(null)
    try {
      const next = await syncVideoCopyExtraction(id)
      setRecord(next)
      setHistory((items) => items.map((item) => (item.id === next.id ? next : item)))
      setCoverFailed(false)
      if (next.status === "failed") {
        setError(next.errorMessage ?? "文案提取失败，请稍后重试。")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "同步失败，请稍后重试。"
      setError(message)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    listVideoCopyExtractions()
      .then((data) => {
        setHistory(data.items)
        if (data.items[0]) setRecord(data.items[0])
      })
      .catch(() => {})
    // ponytail: load once; add pagination when history exceeds 10 useful items.
  }, [])

  useEffect(() => {
    if (!activeRecordId || !activeRecordStatus || !ACTIVE_STATUSES.has(activeRecordStatus) || syncing) return

    const timer = window.setTimeout(() => {
      void sync(activeRecordId)
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [activeRecordId, activeRecordStatus, activeRecordUpdatedAt, syncing])

  return (
    <div className="space-y-6 pb-10">
      <WorkbenchHero
        title="爆款文案拆解"
        subtitle="粘贴对标视频链接，提取原文案并拆解结构、心理、商业和可迁移打法，加入选题池作为参考。"
        badge={<Badge variant="secondary">{statusLabel(record)}</Badge>}
        backHref="/competitor"
        backLabel="返回优质账号分析"
        actions={record ? (
            <Button
              variant="outline"
              onClick={() => void sync(record.id)}
              disabled={syncing || submitting}
              className="w-full lg:w-auto"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新状态
            </Button>
          ) : null}
      />

      <AiResultPanel
        title="视频链接"
        icon={<Send className="h-4 w-4 text-primary" />}
        meta={<span>支持抖音、B站或其他可识别的视频链接</span>}
        flat
      >
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <Textarea
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="粘贴抖音、B站或其他视频链接"
            className="min-h-24 resize-none"
          />
          <Button
            onClick={submit}
            disabled={submitting || isActive}
            className="h-11 md:self-end"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            开始提取
          </Button>
        </div>
      </AiResultPanel>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">最近记录</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setRecord(item)
                  setCoverFailed(false)
                }}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.videoTitle || item.sourceUrl}
                  </span>
                  <span className="text-xs text-muted-foreground">{platformLabel(item.platform)} · {statusLabel(item)}</span>
                </span>
                {record?.id === item.id ? <Badge variant="secondary">当前</Badge> : null}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {record ? (
        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-[180px_1fr]">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
              {record.videoCover && !coverFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={record.videoCover}
                  alt={record.videoTitle ?? "视频封面"}
                  className="h-full w-full object-cover"
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <Video className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{platformLabel(record.platform)}</Badge>
                {record.videoDuration ? <Badge variant="outline">{record.videoDuration}</Badge> : null}
                {isActive ? <Badge className="animate-pulse">处理中</Badge> : null}
              </div>
              <div className="space-y-1">
                <h2 className="line-clamp-2 text-base font-semibold">
                  {record.videoTitle || "等待提取视频信息"}
                </h2>
                <Link
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                >
                  <span className="truncate">{record.sourceUrl}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                {record.status === "completed"
                  ? "文案已提取，可直接复制或参考结构化拆解。"
                  : record.status === "failed"
                    ? "这条链接暂时没有提取成功，可以换一个链接重试。"
                    : "正在提取文案，完成后会自动进入结构化分析。"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {record?.transcript ? (
        <AiResultPanel
          title="原始文案"
          icon={<FileText className="h-4 w-4 text-primary" />}
          meta={<span>{record.transcript.length} 字</span>}
          flat
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyText(record.transcript ?? "", "文案已复制")}
            >
              <Clipboard className="h-4 w-4" />
              复制
            </Button>
          }
        >
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{record.transcript}</p>
        </AiResultPanel>
      ) : null}

      {analysis ? (
        <AiResultPanel
          title="爆款内容商业拆解"
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          meta={<span>结构化分析报告</span>}
          flat
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyText(cleanVideoCopyAnalysisMarkdown(analysis.markdown), "分析报告已复制")}
            >
              <Clipboard className="h-4 w-4" />
              复制分析报告
            </Button>
          }
        >
          <VideoCopyAnalysisCards markdown={analysis.markdown} />
        </AiResultPanel>
      ) : record?.analysisError ? (
        <Card className="border-amber-200">
          <CardContent className="p-4 text-sm text-amber-700">{record.analysisError}</CardContent>
        </Card>
      ) : null}

      {topComments.length > 0 ? (
        <AiResultPanel
          title="粉丝热评"
          icon={<MessageCircle className="h-4 w-4 text-primary" />}
          meta={<span>精选高赞评论 · 帮你找到受众的真实反应和选题灵感</span>}
          flat
        >
          <div className="space-y-3">
            {topComments.map((comment, i) => (
              <div key={i} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm leading-relaxed text-foreground/90">{comment.text}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>👍 {comment.likes}</span>
                  {comment.isTop && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">置顶</span>}
                </div>
              </div>
            ))}
          </div>
        </AiResultPanel>
      ) : record?.status === "completed" && !record.analysisError ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-5 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-8 w-8" />
            <p>暂无热评数据</p>
            <p className="text-xs">热评需要视频有 100+ 点赞的评论才会展示，当前仅支持抖音和小红书。</p>
          </CardContent>
        </Card>
      ) : null}

      {record?.status === "completed" && record.transcript ? (
        <AiResultPanel
          title="进入文案创作"
          icon={<Wand2 className="h-4 w-4 text-primary" />}
          meta={<span>带入原文案和拆解结果</span>}
          flat
          actions={
            <Link
              href={rewriteHref}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Wand2 className="h-4 w-4" />
              进入文案创作
            </Link>
          }
        >
          <p className="text-sm leading-6 text-muted-foreground">
            打开内容文案创作，并带入本参考文案和拆解；再创作规则在后台自动生效，你在文案创作里继续写就行。
          </p>
        </AiResultPanel>
      ) : null}
    </div>
  )
}
