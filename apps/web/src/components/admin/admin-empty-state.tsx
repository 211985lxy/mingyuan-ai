import { FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface AdminEmptyStateProps {
  message?: string
  action?: React.ReactNode
}

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
