"use client"

import Link from "next/link"
import { Loader2 } from "lucide-react"

import { AimStylePreviewDialog } from "@/components/aim/aim-style-preview-dialog"
import { ExpressionStyleFeedForm } from "@/components/projects/expression-style-feed-form"
import { Button } from "@/components/ui/button"
import { useExpressionStylePanel } from "@/features/aim/hooks/use-expression-style-panel"

interface ExpressionStylePanelProps {
  projectId: string
  autoExpandFeed?: boolean
}

/** 「我是谁 → 我的表达风格」：查看、批量投喂、归档 */
export function ExpressionStylePanel({ projectId, autoExpandFeed = false }: ExpressionStylePanelProps) {
  const s = useExpressionStylePanel(projectId, autoExpandFeed)

  if (s.loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />加载表达风格…
      </div>
    )
  }

  const updatedLabel = s.profile?.updatedAt
    ? new Date(s.profile.updatedAt).toLocaleString("zh-CN")
    : null

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-background/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">我的表达风格</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.profile ? `已启用 · 更新于 ${updatedLabel}` : "尚未建立项目风格档案（生成时会回退个人全局风格）"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => s.setFeedOpen((v) => !v)}>
            {s.feedOpen ? "收起投喂" : "添加历史文案"}
          </Button>
          <Link href="/aim" className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            重新测试生成
          </Link>
          {s.profile ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={s.archiving} onClick={() => void s.handleArchive()}>
              归档
            </Button>
          ) : null}
        </div>
      </div>

      {s.profile ? (
        <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">
          {s.profile.content.slice(0, 1200)}{s.profile.content.length > 1200 ? "…" : ""}
        </pre>
      ) : null}

      {s.feedOpen ? (
        <ExpressionStyleFeedForm
          samples={s.samples}
          setSamples={s.setSamples}
          onAddSample={s.addSample}
          onStartPreview={s.startPreview}
        />
      ) : null}

      <AimStylePreviewDialog
        open={s.previewOpen}
        samples={s.previewSamples}
        projectId={projectId}
        onOpenChange={s.setPreviewOpen}
        onCommitted={s.onPreviewCommitted}
      />
    </div>
  )
}
