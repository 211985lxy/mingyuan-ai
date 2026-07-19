"use client"

import React from "react"
import { Check, Loader2, Pencil, Plus, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import {
  AdminApiError,
  getAdminHotSources,
  saveAdminHotSource,
  type AdminHotSourceItem,
  type AdminHotSourceInput,
} from "@/lib/api/admin-client"

const EMPTY_FORM: AdminHotSourceInput = {
  email: "",
  sourceName: "",
  sourceUrl: "",
  sourceType: "static",
  enabled: true,
  note: "",
}

export default function AdminHotSourcesPage() {
  const [sources, setSources] = React.useState<AdminHotSourceItem[]>([])
  const [selected, setSelected] = React.useState<AdminHotSourceInput>(EMPTY_FORM)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const fetchSources = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminHotSources()
      setSources(res.data)
      if (res.data[0]) setSelected(toInput(res.data[0]))
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "信源加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSources()
  }, [fetchSources])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveAdminHotSource(selected)
      toast.success("热点信源已保存")
      await fetchSources()
    } catch (error) {
      const message = error instanceof AdminApiError ? error.message : "保存失败"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  function startNewSource() {
    setSelected(EMPTY_FORM)
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="热点信源"
        description="按账号配置选题雷达使用的行业信源；保存后，前台会优先读取这里的内容。"
        actions={<>
          <Button onClick={startNewSource} className="cursor-pointer">
            <Plus className="mr-1.5 h-4 w-4" />
            新建信源
          </Button>
          <Button variant="outline" onClick={fetchSources} disabled={loading} className="cursor-pointer">
            <RotateCcw className="h-4 w-4" />
            刷新
          </Button>
        </>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : sources.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                还没有热点信源。右侧添加一个账号信源。
              </CardContent>
            </Card>
          ) : (
            sources.map((source) => (
              <Card key={`${source.email}-${source.sourceUrl}`}>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{source.sourceName}</span>
                      <Badge variant={source.enabled ? "default" : "outline"}>
                        {source.enabled ? "启用" : "停用"}
                      </Badge>
                      {source.isBuiltIn && <Badge variant="secondary">内置默认</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{source.email}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{source.sourceUrl}</p>
                    <p className="text-xs text-muted-foreground">{source.isBuiltIn ? "系统内置信源" : `最近更新：${source.updatedAt ? new Date(source.updatedAt).toLocaleString("zh-CN") : "暂无记录"}`}</p>
                    {source.note && <p className="text-xs text-muted-foreground">{source.note}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelected(toInput(source))}
                    className="shrink-0 cursor-pointer"
                    aria-label="编辑信源"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardContent className="py-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">账号信源配置</h2>
                <Button
                  type="button"
                  variant={selected.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelected((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  className="cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  {selected.enabled ? "已启用" : "已停用"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hot-source-email">账号邮箱</Label>
                <Input
                  id="hot-source-email"
                  value={selected.email}
                  onChange={(e) => setSelected((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="957739245@qq.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hot-source-name">信源名称</Label>
                <Input
                  id="hot-source-name"
                  value={selected.sourceName}
                  onChange={(e) => setSelected((prev) => ({ ...prev, sourceName: e.target.value }))}
                  placeholder="中汝达AI数字供暖情报雷达"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hot-source-url">信源地址</Label>
                <Input
                  id="hot-source-url"
                  value={selected.sourceUrl}
                  onChange={(e) => setSelected((prev) => ({ ...prev, sourceUrl: e.target.value }))}
                  placeholder="/hot-sources/zhongruda-ai-heating/items.json"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hot-source-note">备注</Label>
                <Textarea
                  id="hot-source-note"
                  value={selected.note}
                  rows={3}
                  onChange={(e) => setSelected((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="这个账号的热点精选只从该信源取数"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving} className="cursor-pointer">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存信源
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(EMPTY_FORM)}
                  className="cursor-pointer"
                >
                  新增
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function toInput(source: AdminHotSourceItem): AdminHotSourceInput {
  return {
    email: source.email,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    sourceType: source.sourceType,
    enabled: source.enabled,
    note: source.note,
  }
}
