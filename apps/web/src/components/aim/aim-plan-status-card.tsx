"use client"

import { AlertTriangle, Loader2, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"

interface AimPlanStatusCardProps {
  loading: boolean
  error?: string
  onRetry: () => void
  onAbandon: () => void
}

/** 计划模式首轮/轮间加载与失败状态，避免用户停在无反馈的空白区。 */
export function AimPlanStatusCard({
  loading,
  error,
  onRetry,
  onAbandon,
}: AimPlanStatusCardProps) {
  return (
    <div className="mx-auto w-full max-w-lg rounded-xl border border-primary/20 bg-card px-4 py-4 shadow-sm">
      {loading ? (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          <span>正在结合本次需求读取项目档案…</span>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">计划问题生成失败</p>
            <p className="mt-1 text-xs text-muted-foreground">{error || "请稍后重试"}</p>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        {!loading ? (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            重试
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onAbandon}>
          <X className="h-3.5 w-3.5" />
          退出计划
        </Button>
      </div>
    </div>
  )
}
