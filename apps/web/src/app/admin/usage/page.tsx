"use client"

import React from "react"
import { toast } from "sonner"
import { Loader2, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface UsageRecord {
  id: string
  userId: string | null
  agentId: string | null
  action: string
  status: string
  durationMs: number | null
  model: string | null
  totalTokens: number | null
  errorMessage: string | null
  createdAt: string
}

export default function AdminUsagePage() {
  const [records, setRecords] = React.useState<UsageRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [total, setTotal] = React.useState(0)

  const fetchRecords = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/agents/traces?limit=50")
      if (!res.ok) throw new Error("加载失败")
      const json = await res.json()
      setRecords(json.data?.traces ?? [])
      setTotal(json.data?.stats?.total24h ?? 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "使用记录加载失败")
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecords()
  }, [fetchRecords])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">使用记录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            智能体 API 调用记录和执行详情
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">最近执行记录（共 {total} 条/24h）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">智能体</th>
                  <th className="text-left p-3 font-medium">操作</th>
                  <th className="text-left p-3 font-medium">状态</th>
                  <th className="text-left p-3 font-medium">模型</th>
                  <th className="text-right p-3 font-medium">耗时</th>
                  <th className="text-right p-3 font-medium">Token</th>
                  <th className="text-left p-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      暂无使用记录
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{record.agentId || "—"}</td>
                      <td className="p-3 text-muted-foreground">{record.action}</td>
                      <td className="p-3">
                        <Badge variant={record.status === "success" ? "default" : "destructive"} className="text-xs">
                          {record.status === "success" ? "成功" : record.status === "failed" ? "失败" : record.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{record.model || "—"}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {record.durationMs != null ? `${(record.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {record.totalTokens?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(record.createdAt).toLocaleString("zh-CN")}
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
