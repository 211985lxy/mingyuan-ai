"use client"

import React from "react"
import { FileText, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { toast } from "sonner"

interface Template {
  id: string
  name: string
  displayName: string
  description: string | null
  contentType: string
  status: string
  industry: string[]
  sortOrder: number
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-gray-100 text-gray-700",
  archived: "bg-red-100 text-red-700",
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState("")
  const [contentTypeFilter, setContentTypeFilter] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const pageSize = 20

  const fetchTemplates = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (statusFilter) params.set("status", statusFilter)
      if (contentTypeFilter) params.set("contentType", contentTypeFilter)
      const res = await fetch(`/api/admin/templates?${params}`)
      const json = await res.json()
      setTemplates(json.data?.results ?? [])
      setTotal(json.data?.total ?? 0)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "模板列表加载失败，请重试")
      setTemplates([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, contentTypeFilter])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTemplates()
  }, [fetchTemplates])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="内容模板"
        description="管理可复用的内容结构与提示词；先筛选，再进入对应业务场景使用。"
        meta={<Badge variant="secondary">{total} 个模板</Badge>}
      />

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(!v || v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="published">已发布</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="archived">已归档</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contentTypeFilter} onValueChange={(v) => { setContentTypeFilter(!v || v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="marketing">营销</SelectItem>
            <SelectItem value="education">教育</SelectItem>
            <SelectItem value="storytelling">故事</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p>暂无模板</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="p-4">名称</th>
                  <th className="p-4">类型</th>
                  <th className="p-4">状态</th>
                  <th className="p-4">排序</th>
                  <th className="p-4">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium">{t.displayName}</div>
                      <div className="text-xs text-muted-foreground">{t.name}</div>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{t.contentType}</Badge>
                    </td>
                    <td className="p-4">
                      <Badge className={STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-700"}>
                        {t.status === "published" ? "已发布" : t.status === "draft" ? "草稿" : t.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">{t.sortOrder}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页，共 {total} 条
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="cursor-pointer">
              <ChevronLeft className="h-4 w-4" /> 上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="cursor-pointer">
              下一页 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
