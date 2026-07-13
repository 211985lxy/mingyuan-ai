import {
  Check, Copy, Download, ExternalLink, Heart, Info, MessageSquare, Send, Sparkles, Star, Target, TrendingUp, Video,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { VideoPublishDetails } from "@/features/videos/components/video-publish-details"
import type { ApiVideoTask, MarketingAnalysisData } from "@/types/api"

const DEFAULT_PUBLISH_TAGS = ["营销干货", "短视频运营", "小企业主"]

function normalizeTag(tag: string): string {
  return tag.replace(/^#+|#+$/g, "").trim()
}

function buildPublishTags(task: ApiVideoTask): string[] {
  const tags = new Set<string>()
  for (const tag of task.sourceTemplateTags ?? []) {
    const normalized = normalizeTag(tag)
    if (normalized) tags.add(normalized)
  }
  if (task.hotTopic) {
    const normalized = normalizeTag(task.hotTopic)
    if (normalized) tags.add(normalized)
  }
  for (const tag of DEFAULT_PUBLISH_TAGS) {
    if (tags.size >= 6) break
    tags.add(tag)
  }
  return [...tags].slice(0, 6)
}

export function VideoCompletedView({ task, copied, copiedField, onCopyScript, onCopyField }: { task: ApiVideoTask; copied: boolean; copiedField: string | null; onCopyScript: () => void; onCopyField: (text: string, field: string) => void }) {
  const analysis: MarketingAnalysisData | null = task.marketingAnalysis ?? null
  const analysisLoading = !!task.videoUrl && !task.marketingAnalysis
  const publishInfo = {
    title: `${task.scriptContent.slice(0, 20)}...｜${task.avatarName}带你了解`,
    description: task.scriptContent,
    tags: buildPublishTags(task),
  }
  const publishLoading = false
  const publishTagsText = publishInfo.tags.map((tag) => `#${tag}#`).join(" ")

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
              onClick={onCopyScript}
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

      <VideoPublishDetails
        task={task}
        publishInfo={publishInfo}
        publishLoading={publishLoading}
        publishTagsText={publishTagsText}
        copiedField={copiedField}
        onCopyField={onCopyField}
      />

    </div>
  )
}
