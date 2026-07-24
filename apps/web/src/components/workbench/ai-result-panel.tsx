import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AiResultPanelProps {
  title: string
  icon?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  flat?: boolean
}

/**
 * @description airesultpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AiResultPanel({
  title,
  icon,
  meta,
  actions,
  children,
  className,
  contentClassName,
  flat = false,
}: AiResultPanelProps) {
  if (flat) {
    return (
      <div className={`mt-4 border-t border-border/50 pt-2 w-full ${className ?? ""}`}>
        <div className="mb-2 flex flex-row items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
              {icon}
              <span className="truncate">{title}</span>
            </div>
            {meta ? <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{meta}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div> : null}
        </div>
        <div className={contentClassName ?? "py-0"}>{children}</div>
      </div>
    )
  }

  return (
    <Card className={`overflow-hidden border-primary/15 shadow-sm ${className ?? ""}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            <span className="truncate">{title}</span>
          </CardTitle>
          {meta ? <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={contentClassName ?? "p-4"}>{children}</CardContent>
    </Card>
  )
}
