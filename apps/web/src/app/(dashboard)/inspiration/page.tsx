"use client"

import { useEffect, useState } from "react"
import {
  Clipboard,
  FileText,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createInspiration,
  listInspirations,
  processInspiration,
  generateFromInspiration,
  listClientProjects,
  type InspirationItem,
  type ClientProject,
} from "@/lib/api/client"
import type { AimGenerateResult } from "@/lib/api/client"

const SOURCE_LABELS: Record<string, string> = {
  text: "手动输入",
  feishu: "飞书",
  wechat: "微信",
}

function aiStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "AI 处理中",
    processing: "AI 处理中",
    completed: "已分析",
    failed: "分析失败",
  }
  return labels[status] || status
}

function aiStatusColor(status: string) {
  const colors: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-600",
    processing: "bg-blue-500/10 text-blue-600",
    completed: "bg-green-500/10 text-green-600",
    failed: "bg-red-500/10 text-red-600",
  }
  return colors[status] || "bg-muted text-muted-foreground"
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "刚刚"
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
}

export default function InspirationPage() {
  const [inspirations, setInspirations] = useState<InspirationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      listInspirations(),
      listClientProjects(),
    ]).then(([data, projectData]) => {
      setInspirations(data.items)
      setProjects(projectData)
      setSelectedProjectId(projectData.find((p) => p.status === "active")?.id || projectData[0]?.id || "")
    }).catch(() => {
      toast.error("加载失败，请刷新重试")
    }).finally(() => setLoading(false))
  }, [])

  async function handleSubmit() {
    const text = input.trim()
    if (!text) {
      toast.error("请先输入灵感内容")
      return
    }

    setSubmitting(true)
    try {
      const item = await createInspiration({ content: text, projectId: selectedProjectId || undefined })
      setInspirations((prev) => [item, ...prev])
      setInput("")
      toast.success("灵感已保存，AI 正在分析选题方向")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReprocess(id: string) {
    if (reprocessingId) return
    setReprocessingId(id)
    try {
      await processInspiration(id)
      setInspirations((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, aiStatus: "processing" } : item
        )
      )
      toast.success("AI 分析已重新启动")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "处理失败")
    } finally {
      setReprocessingId(null)
    }
  }

  async function handleGenerateContent(inspiration: InspirationItem) {
    if (!selectedProjectId) {
      toast.error("你的 IP 营销全案还在配置中")
      return
    }

    setGeneratingId(inspiration.id)
    try {
      const result = await generateFromInspiration(inspiration.id, {
        projectId: selectedProjectId,
        topicTitle: undefined,
      })
      setInspirations((prev) =>
        prev.map((item) =>
          item.id === inspiration.id
            ? { ...item, generatedContent: result, aiStatus: "completed" }
            : item
        )
      )
      toast.success("文案已生成，可在 AI 内容总监中查看")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败")
    } finally {
      setGeneratingId(null)
    }
  }

  const hasContent = inspirations.length > 0

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-lg border bg-background p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Lightbulb className="h-6 w-6 text-amber-500" />
              灵感收集器
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              随时记录灵感，AI 自动分析出选题方向，一键生成文案。
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的灵感：老板的随口一句话、客户的反馈、刷到的爆款思路、突然想到的切入角度……"
            className="min-h-28 resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                AI 会自动分析灵感，提炼 2-3 个选题方向
              </p>
              <Select value={selectedProjectId || "unassigned"} onValueChange={(value) => setSelectedProjectId(!value || value === "unassigned" ? "" : value)}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="暂不归属项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">暂不归属项目</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !input.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              保存灵感
            </Button>
          </div>
        </div>
      </section>

      {/* 灵感列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : !hasContent ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <Lightbulb className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              还没有灵感记录，在输入框里写下你的想法吧
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inspirations.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* 原始灵感 */}
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                      {item.content}
                    </p>

                    {/* AI 生成的选题建议 */}
                    {item.aiStatus === "completed" && item.generatedTopics && item.generatedTopics.length > 0 && (
                      <div className="mt-3 space-y-2 rounded-lg bg-muted/30 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Target className="h-3.5 w-3.5 text-primary" />
                          AI 推荐选题方向
                        </p>
                        <div className="space-y-1.5">
                          {item.generatedTopics.map((topic, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 rounded-md bg-background p-2.5 text-sm"
                            >
                              <span className="mt-0.5 shrink-0 text-xs font-bold text-primary">
                                #{idx + 1}
                              </span>
                              <div>
                                <p className="font-medium text-foreground">{topic.title}</p>
                                {topic.rationale && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {topic.rationale}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 已生成的文案内容 */}
                    {item.generatedContent?.results && item.generatedContent.results.length > 0 && (
                      <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/[0.02] p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          已生成文案
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.generatedContent.results.map((r: AimGenerateResult, idx: number) => {
                            const labelMap: Record<string, string> = {
                              video_script: "视频脚本",
                              wechat_article: "公众号文章",
                              moments_post: "朋友圈文案",
                              community_message: "社群文案",
                              shooting_brief: "拍摄交接单",
                              raw_copy: "诊断报告",
                            }
                            return (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(r.content)
                                  toast.success(`${labelMap[r.format] || r.format} 已复制`)
                                }}
                              >
                                <Clipboard className="mr-1 h-3 w-3" />
                                {labelMap[r.format] || r.format} · {r.wordCount}字
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {item.aiStatus === "failed" && item.errorMessage && (
                      <p className="text-xs text-destructive">{item.errorMessage}</p>
                    )}

                    {item.aiStatus === "pending" || item.aiStatus === "processing" ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        AI 正在分析选题方向…
                      </div>
                    ) : null}
                  </div>

                  {/* 右侧信息 */}
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge className={aiStatusColor(item.aiStatus)} variant="secondary">
                      {item.aiStatus === "pending" || item.aiStatus === "processing" ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {aiStatusLabel(item.aiStatus)}
                        </span>
                      ) : (
                        aiStatusLabel(item.aiStatus)
                      )}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {SOURCE_LABELS[item.source] || item.source} · {formatTime(item.createdAt)}
                    </span>

                    {/* 操作按钮 */}
                    <div className="mt-1 flex flex-col gap-1.5">
                      {item.aiStatus === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={reprocessingId === item.id}
                          onClick={() => handleReprocess(item.id)}
                        >
                          {reprocessingId === item.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                          )}
                          重新分析
                        </Button>
                      )}
                      {item.aiStatus === "completed" && selectedProjectId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={generatingId === item.id}
                          onClick={() => handleGenerateContent(item)}
                        >
                          {generatingId === item.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1 h-3 w-3" />
                          )}
                          生成文案
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
