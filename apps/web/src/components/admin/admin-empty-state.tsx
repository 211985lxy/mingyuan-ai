"use client";
import { FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface AdminEmptyStateProps {
  message?: string
  action?: React.ReactNode
}

/**
 * @description adminemptystate
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AdminEmptyState({
  message = "暂无数据",
  action,
}: AdminEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <p className="text-sm text-muted-foreground">{message}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  )
}
