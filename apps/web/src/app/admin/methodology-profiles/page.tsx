"use client"

import React from "react"
import Link from "next/link"
import { BookMarked, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

interface ProfileListItem {
  id: string
  name: string
  slug: string
  originatorName: string | null
  aliases: string[]
  description: string | null
  scope: string
  status: string
  methodologyType: string
  applicableAgents: string[]
  latestPublishedVersion: number | null
  latestDraftVersion: number | null
  updatedAt: string
}

export default function AdminMethodologyProfilesPage() {
  const [items, setItems] = React.useState<ProfileListItem[]>([])
  const [loading, setLoading] = React.useState(true)

  const fetchItems = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/methodology-profiles")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "加载失败")
      setItems(Array.isArray(json.data) ? json.data : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems()
  }, [fetchItems])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="命名方法论"
        description="徐沪生这类可点选的方法论。改内容会新建版本，旧版保留，保证以前生成过的稿能复现。"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/methodology">
              <Button variant="outline" size="sm">系统方法论</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            还没有命名方法论。本地或线上先跑 <code className="mx-1">pnpm seed:methodology</code> 灌入徐沪生。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookMarked className="size-4 text-primary" />
                    {item.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {item.originatorName ? `${item.originatorName} · ` : ""}
                    {item.slug}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.status === "active" ? "default" : "secondary"}>
                    {item.status === "active" ? "启用" : "已归档"}
                  </Badge>
                  <Badge variant="outline">{item.scope === "global" ? "全局" : "私有"}</Badge>
                  <Link href={`/admin/methodology-profiles/${item.id}`}>
                    <Button size="sm">编辑</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{item.description || "暂无简介"}</p>
                <p>
                  已发布 v{item.latestPublishedVersion ?? "—"}
                  {item.latestDraftVersion != null ? ` · 草稿 v${item.latestDraftVersion}` : ""}
                  {" · "}
                  适用：{item.applicableAgents.length ? item.applicableAgents.join("、") : "未指定"}
                </p>
                {item.aliases.length > 0 ? (
                  <p>别名：{item.aliases.join("、")}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
