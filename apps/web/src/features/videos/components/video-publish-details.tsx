import { Check, Copy, Hash, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ApiVideoTask } from "@/types/api"

type PublishInfo = { title: string; description: string; tags: string[] }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function VideoPublishDetails({ task, publishInfo, publishLoading, publishTagsText, copiedField, onCopyField }: { task: ApiVideoTask; publishInfo: PublishInfo; publishLoading: boolean; publishTagsText: string; copiedField: string | null; onCopyField: (text: string, field: string) => void }) {
  return (
    <>
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
                      onCopyField(publishInfo.title, "title")
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
                      onCopyField(publishInfo.description, "desc")
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
                    onClick={() => onCopyField(publishTagsText, "tags")}
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
                      onClick={() => onCopyField(`#${tag}#`, `tag-${tag}`)}
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
    </>
  )
}
