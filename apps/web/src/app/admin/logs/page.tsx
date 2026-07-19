"use client"

import React from "react"
import { toast } from "sonner"
import { Loader2, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

interface AuditLogEntry {
  id: string
  adminId: string
  action: string
  targetType: string
  targetId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export default function AdminLogsPage() {
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([])
  const [loading, setLoading] = React.useState(true)

  const fetchLogs = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/audit-logs?limit=50")
      if (!res.ok) throw new Error("加载失败")
      const json = await res.json()
      setLogs(json.data ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作日志加载失败")
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs()
  }, [fetchLogs])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="操作日志"
        description="查看管理员的关键操作记录，用于问题追溯和变更核查。"
        actions={<Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
          刷新
        </Button>}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">最近操作</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">操作</th>
                  <th className="text-left p-3 font-medium">对象类型</th>
                  <th className="text-left p-3 font-medium">对象 ID</th>
                  <th className="text-left p-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      暂无操作日志记录
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{log.targetType}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{log.targetId || "—"}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(log.createdAt).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
