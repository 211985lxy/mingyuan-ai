import { Clipboard, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getTopicDisplayLabel } from "@/features/topics/topic-presentation"
import type { TopicDailyReport } from "@/lib/topic-daily-report"

export function TopicDailyReportEmptyState({
  error,
  onGenerate,
  disabled,
}: {
  error: string
  onGenerate: () => void
  disabled: boolean
}) {
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-500/[0.03]">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>每日选题日报</Badge>
          <Badge variant="outline">待生成</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl leading-tight">今天拍什么，还没排出来</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">
            点一下生成，先给你今天主推哪条，再补充为什么推它和还有哪些备选。
          </CardDescription>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <Button className="w-fit" onClick={onGenerate} disabled={disabled}>
          <Sparkles className="mr-1 h-4 w-4" />
          生成每日选题日报
        </Button>
      </CardHeader>
    </Card>
  )
}

export function TopicDailyReportPanel({ report }: { report: TopicDailyReport }) {
  async function copyAction() {
    try {
      await navigator.clipboard.writeText(report.copyText)
      toast.success("今日行动已复制")
    } catch {
      toast.error("复制失败，请手动复制")
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-500/[0.04]">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>每日选题日报</Badge>
            {report.leadCard ? <Badge variant="secondary">{getTopicDisplayLabel(report.leadCard)}</Badge> : null}
            {typeof report.leadCard?.score === "number" ? <Badge variant="outline">{report.leadCard.score}分</Badge> : null}
            <Badge variant="outline">{report.hasSourceSnapshot ? "有证据快照" : "待补证据"}</Badge>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-primary/80">第一步 · 先看今天拍什么</p>
            <CardTitle className="text-3xl leading-tight">
              {report.leadCard ? `今天先拍「${report.leadCard.title}」` : "今天先把主推排出来"}
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {report.conclusion}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-primary/10 bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary/80">第二步 · 再看为什么是它</p>
                <CardTitle className="mt-1 text-xl">判断理由和证据</CardTitle>
              </div>
              <Badge variant="outline">{report.evidenceGroups.reduce((sum, group) => sum + group.items.length, 0)} 条</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">为什么先推这条</p>
                <p className="mt-2 text-sm leading-6">{report.reason}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">适合今天拍的原因</p>
                <p className="mt-2 text-sm leading-6">
                  {report.hasSourceSnapshot
                    ? "这条已经有项目、客户或对标证据托底，今天可以直接推进。"
                    : "这条判断已经够明确，但这次缓存还没把证据快照带出来。"}
                </p>
              </div>
            </div>
            {!report.hasSourceSnapshot ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm leading-6 text-amber-800">
                这次缓存没带出证据快照。要定稿，建议重新生成一次，把来源一起补齐。
              </div>
            ) : null}
            <div className="grid gap-3">
              {report.evidenceGroups.map((group) => (
                <div key={group.key} className="rounded-xl border border-border/70 bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{group.label}</Badge>
                    <span className="text-xs text-muted-foreground">{group.description}</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {group.items.map((item, index) => (
                      <div key={`${group.key}-${item.title}-${index}`} className="rounded-lg bg-muted/25 p-3">
                        <p className="text-sm font-semibold leading-5">{item.title}</p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-primary/10 bg-card">
            <CardHeader className="pb-3">
              <p className="text-sm font-medium text-primary/80">第三步 · 直接开拍</p>
              <CardTitle className="mt-1 text-xl">今天怎么讲</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4 text-sm leading-6">
                <p><b>开头：</b>{report.execution.hook}</p>
                <p className="mt-2"><b>展开：</b>{report.execution.angle}</p>
                <p className="mt-2"><b>承接：</b>{report.execution.action}</p>
              </div>
              <div className="rounded-xl bg-foreground p-4 text-background">
                <p className="text-sm leading-6">{report.copyText}</p>
                <Button className="mt-3" variant="secondary" onClick={copyAction}>
                  <Clipboard className="h-4 w-4" />复制今日行动
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">如果这条不拍，再看这些</CardTitle>
              <CardDescription>保留几条最值得替补的方向，方便你快速换题。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.workshop.slice(0, 4).map((topic) => (
                <div key={`${topic.index}-${topic.title}`} className="rounded-xl border border-border/70 bg-muted/15 p-4">
                  <Badge variant="secondary">#{topic.index}</Badge>
                  <p className="mt-2 text-sm font-semibold leading-5">{topic.title}</p>
                  <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                    <p><b>开头：</b>{topic.hook}</p><p><b>角度：</b>{topic.angle}</p><p><b>承接：</b>{topic.cta}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
