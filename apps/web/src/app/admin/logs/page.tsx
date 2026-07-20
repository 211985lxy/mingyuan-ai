"use client"
import React from "react"
import { toast } from "sonner"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AdminPageShell } from "@/components/admin/admin-page-shell"

interface AuditLogEntry { id: string; adminId: string; action: string; targetType: string; targetId: string | null; metadata: unknown; createdAt: string }

export default function AdminLogsPage() {
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]); const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null)
  const fetchLogs = React.useCallback(async () => {
    setLoading(true); setError(null)
    try { const res = await fetch("/api/admin/audit-logs?limit=50"); if (!res.ok) throw new Error("err"); const json = await res.json(); setLogs(json.data ?? []) }
    catch (err) { const msg = err instanceof Error ? err.message : "加载失败"; setError(msg); toast.error(msg); setLogs([]) }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { fetchLogs() }, [fetchLogs])
  return (
    <AdminPageShell title="操作日志" subtitle="管理员操作审计记录" error={error} onRetry={fetchLogs} loading={loading} skeletonRows={5}
      empty={!loading && !error && logs.length === 0} emptyMessage="暂无日志">
      <Card><CardContent className="p-0"><table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50"><th className="p-3 font-medium text-left">操作</th><th className="p-3 font-medium text-left">对象类型</th><th className="p-3 font-medium text-left">对象 ID</th><th className="p-3 font-medium text-left">时间</th></tr></thead>
        <tbody>{logs.map(l => (
          <tr key={l.id} className="border-b hover:bg-muted/30"><td className="p-3"><Badge variant="outline" className="font-mono text-xs">{l.action}</Badge></td><td className="p-3 text-muted-foreground">{l.targetType}</td><td className="p-3 text-xs font-mono text-muted-foreground">{l.targetId||"—"}</td><td className="p-3 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString("zh-CN")}</td></tr>))}</tbody>
      </table></CardContent></Card>
    </AdminPageShell>
  )
}
