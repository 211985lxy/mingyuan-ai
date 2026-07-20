"use client"
import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminPageShell } from "@/components/admin/admin-page-shell"

interface Template { id: string; name: string; displayName: string; description: string | null; contentType: string; status: string; sortOrder: number; createdAt: string }
const STATUS_COLORS: Record<string, string> = { published: "bg-green-100 text-green-700", draft: "bg-gray-100 text-gray-700", archived: "bg-red-100 text-red-700" }

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]); const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1); const [statusFilter, setStatusFilter] = React.useState(""); const [contentTypeFilter, setContentTypeFilter] = React.useState("")
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null); const pageSize = 20
  const fetchTemplates = React.useCallback(async () => {
    setLoading(true); setError(null)
    try { const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); if (statusFilter) params.set("status", statusFilter); if (contentTypeFilter) params.set("contentType", contentTypeFilter)
      const res = await fetch(`/api/admin/templates?${params}`); const json = await res.json(); setTemplates(json.data?.results ?? []); setTotal(json.data?.total ?? 0) }
    catch (err) { const msg = err instanceof Error ? err.message : "加载失败"; setError(msg); toast.error(msg); setTemplates([]); setTotal(0) }
    finally { setLoading(false) }
  }, [page, statusFilter, contentTypeFilter])
  React.useEffect(() => { fetchTemplates() }, [fetchTemplates])
  return (
    <AdminPageShell title="内容模板" subtitle={`管理内容创作模板（共 ${total} 个）`} loading={loading} error={error} onRetry={fetchTemplates} skeletonRows={5}
      empty={!loading && !error && templates.length === 0} emptyMessage="暂无模板"
      filter={<><Select value={statusFilter} onValueChange={(v) => { setStatusFilter(!v||v==="all"?"":v); setPage(1) }}><SelectTrigger className="w-35 h-9"><SelectValue placeholder="状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="published">已发布</SelectItem><SelectItem value="draft">草稿</SelectItem><SelectItem value="archived">归档</SelectItem></SelectContent></Select></>}>
      <Card><CardContent className="p-0"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">名称</th><th className="p-4 font-medium">类型</th><th className="p-4 font-medium">状态</th><th className="p-4 font-medium">排序</th><th className="p-4 font-medium">创建时间</th></tr></thead>
        <tbody>{templates.map(t => (<tr key={t.id} className="border-b hover:bg-muted/50"><td className="p-4"><div className="font-medium">{t.displayName}</div><div className="text-xs text-muted-foreground">{t.name}</div></td><td className="p-4"><Badge variant="outline">{t.contentType}</Badge></td><td className="p-4"><Badge className={STATUS_COLORS[t.status]??""}>{t.status=== "published"?"已发布":t.status}</Badge></td><td className="p-4 text-sm text-muted-foreground">{t.sortOrder}</td><td className="p-4 text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</td></tr>))}</tbody></table></CardContent></Card>
    </AdminPageShell>
  )
}
