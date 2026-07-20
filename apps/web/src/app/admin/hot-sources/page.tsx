"use client"
import React from "react"
import { Check, Loader2, Pencil, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AdminApiError, getAdminHotSources, saveAdminHotSource, type AdminHotSourceItem, type AdminHotSourceInput } from "@/lib/api/admin-client"
import { AdminPageShell } from "@/components/admin/admin-page-shell"

const EMPTY: AdminHotSourceInput = { email: "", sourceName: "", sourceUrl: "", sourceType: "static", enabled: true, note: "" }
export default function AdminHotSourcesPage() {
  const [sources, setSources] = React.useState<AdminHotSourceItem[]>([]); const [selected, setSelected] = React.useState<AdminHotSourceInput>(EMPTY)
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null); const [saving, setSaving] = React.useState(false)
  const fetchSources = React.useCallback(async () => { setLoading(true); setError(null); try { const r = await getAdminHotSources(); setSources(r.data); if (r.data[0]) setSelected(toI(r.data[0])) } catch (e) { const m = e instanceof Error ? e.message : "加载失败"; setError(m); toast.error(m) } finally { setLoading(false) } }, [])
  React.useEffect(() => { fetchSources() }, [fetchSources])
  async function save(e: React.FormEvent) { e.preventDefault(); setSaving(true); try { await saveAdminHotSource(selected); toast.success("已保存"); await fetchSources() } catch (e) { toast.error(e instanceof AdminApiError ? e.message : "保存失败") } finally { setSaving(false) } }
  return (
    <AdminPageShell title="热点信源" subtitle="按账号绑定热点精选使用的行业信源。" loading={loading} error={error} onRetry={fetchSources} skeletonRows={3}
      empty={!loading && !error && sources.length===0} emptyMessage="还没有热点信源。"
      actions={<Button variant="outline" onClick={fetchSources} disabled={loading}><RotateCcw className="h-4 w-4" />刷新</Button>}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]"><div className="space-y-3">{sources.map(s=><Card key={`${s.email}-${s.sourceUrl}`}><CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{s.sourceName}</span><Badge variant={s.enabled?"default":"outline"}>{s.enabled?"启用":"停用"}</Badge>{s.isBuiltIn?<Badge variant="secondary">内置</Badge>:null}</div><p className="text-sm text-muted-foreground">{s.email}</p><p className="break-all font-mono text-xs text-muted-foreground">{s.sourceUrl}</p>{s.note?<p className="text-xs text-muted-foreground">{s.note}</p>:null}</div>
        <Button variant="ghost" size="icon" onClick={()=>setSelected(toI(s))}><Pencil className="h-4 w-4"/></Button></CardContent></Card>)}</div>
        <Card><CardContent className="py-5"><form onSubmit={save} className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">配置</h2><Button type="button" variant={selected.enabled?"default":"outline"} size="sm" onClick={()=>setSelected(p=>({...p,enabled:!p.enabled}))}><Check className="h-4 w-4"/>{selected.enabled?"已启用":"已停用"}</Button></div>
          <div><Label>账号邮箱</Label><Input value={selected.email} onChange={e=>setSelected(p=>({...p,email:e.target.value}))}/></div>
          <div><Label>信源名称</Label><Input value={selected.sourceName} onChange={e=>setSelected(p=>({...p,sourceName:e.target.value}))}/></div>
          <div><Label>信源地址</Label><Input value={selected.sourceUrl} onChange={e=>setSelected(p=>({...p,sourceUrl:e.target.value}))}/></div>
          <div><Label>备注</Label><Textarea value={selected.note} rows={3} onChange={e=>setSelected(p=>({...p,note:e.target.value}))}/></div>
          <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}保存</Button><Button type="button" variant="outline" onClick={()=>setSelected(EMPTY)}>新增</Button></div>
        </form></CardContent></Card></div>
    </AdminPageShell>
  )
}
function toI(s: AdminHotSourceItem): AdminHotSourceInput { return { email: s.email, sourceName: s.sourceName, sourceUrl: s.sourceUrl, sourceType: s.sourceType, enabled: s.enabled, note: s.note } }
