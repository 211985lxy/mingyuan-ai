"use client"

import { AlertTriangle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AdminErrorBannerProps {
  message?: string
  onRetry?: () => void
}

export function AdminErrorBanner({
  message = "数据加载失败，请重试。",
  onRetry,
}: AdminErrorBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} className="shrink-0 h-7 cursor-pointer">
          <RotateCw className="h-3.5 w-3.5 mr-1" />
          重试
        </Button>
      )}
    </div>
  )
}
