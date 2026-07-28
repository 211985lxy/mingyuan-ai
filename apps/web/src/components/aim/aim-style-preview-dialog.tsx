"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  dimHasContent,
  formatStyleDim,
  STYLE_DIMENSION_LABELS,
  useAimStylePreview,
} from "@/features/aim/hooks/use-aim-style-preview"
import { cn } from "@/lib/utils"

export interface AimStylePreviewDialogProps {
  open: boolean
  samples: Array<{ content: string; label?: "core" | "normal" }>
  projectId?: string | null
  onOpenChange: (open: boolean) => void
  onCommitted?: () => void
}

/** 风格分析预览：先看八维候选，确认后再写库 */
export function AimStylePreviewDialog(props: AimStylePreviewDialogProps) {
  const state = useAimStylePreview(props)

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) state.resetLocal()
        props.onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>风格分析预览</DialogTitle>
          <DialogDescription>
            先看提炼结果，确认后再写入「我的表达风格」。取消不会改动现有档案。
          </DialogDescription>
        </DialogHeader>

        {state.loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />正在分析风格…
          </div>
        ) : null}

        {state.error ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-destructive">{state.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void state.runPreview()}>重试分析</Button>
          </div>
        ) : null}

        {state.delta ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              置信度：{state.delta.confidence} · 证据：{state.delta.evidence}
            </p>
            {STYLE_DIMENSION_LABELS.map(({ key, label }) => {
              if (!dimHasContent(state.delta![key])) return null
              const enabled = state.enabledKeys.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => state.toggleKey(key)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30 opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">{enabled ? "保留" : "已取消"}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatStyleDim(state.delta![key])}</p>
                </button>
              )
            })}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)} disabled={state.committing}>取消</Button>
          <Button type="button" onClick={() => void state.handleCommit()} disabled={!state.delta || state.committing || state.loading}>
            {state.committing ? "写入中…" : "确认写入风格档案"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
