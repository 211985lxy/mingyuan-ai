"use client"
import React from "react"
import { Download, Plus, Loader2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { getActivationCodes, getActivationCodeStats, downloadActivationCodesExport, generateActivationCodes, type ActivationCodeItem, AdminApiError } from "@/lib/api/admin-client"
import { AdminPageShell } from "@/components/admin/admin-page-shell"

function formatCode(c: string) { return c.replace(/(.{4})/g,"$1-").replace(/-$/,"") }

export default function AdminActivationCodesPage() {
  const [codes, setCodes] = React.useState<ActivationCodeItem[]>([]); const [stats, setStats] = React.useState<{total:number;unused:number;used:number;usageRate:number}|null>(null)
  const [batches, setBatches] = React.useState<string[]>([]); const [total, setTotal] = React.useState(0); const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState(""); const [batchFilter, setBatchFilter] = React.useState("")
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null); const [dialogOpen, setDialogOpen] = React.useState(false); const pageSize = 20
  const fetchCodes = React.useCallback(async () => {
    setLoading(true); setError(null)
    try { const res = await getActivationCodes({ page, pageSize, status: statusFilter, batchId: batchFilter }); setCodes(res.data.results); setTotal(res.data.total); setBatches(res.data.batches) }
    catch (err) { const msg = err instanceof Error ? err.message : "加载失败"; setError(msg); toast.error(msg); setCodes([]); setTotal(0); setBatches([]) }
    finally { setLoading(false) }
  }, [page, statusFilter, batchFilter])
  const fetchStats = React.useCallback(async () => { try { const res = await getActivationCodeStats(); setStats(res.data) } catch { setStats(null) } }, [])
  React.useEffect(() => { fetchCodes() }, [fetchCodes]); React.useEffect(() => { fetchStats() }, [fetchStats])
  const totalPages = Math.ceil(total / pageSize)
  async function handleExport() { try { const {blob,fileName} = await downloadActivationCodesExport({}); const u=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=u; a.download=fileName; a.click(); URL.revokeObjectURL(u); toast.success("导出成功") } catch { toast.error("导出失败") } }
  function onGen() { setDialogOpen(false); setPage(1); fetchCodes(); fetchStats() }
  return (
    <AdminPageShell title="激活码管理" subtitle="管理激活码的生成、使用和导出" loading={loading} error={error} onRetry={fetchCodes} skeletonRows={5}
      empty={!loading && !error && codes.length===0} emptyMessage="未找到激活码"
      actions={<Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />生成激活码</Button></DialogTrigger><DialogContent><GenForm onSuccess={onGen} /></DialogContent></Dialog>}
      stats={<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><StatCard2 title="总数" value={stats?.total} /><StatCard2 title="未使用" value={stats?.unused} /><StatCard2 title="已使用" value={stats?.used} /><StatCard2 title="使用率" value={stats?`${stats.usageRate}%`:undefined} /></div>}
      filter={<><Select value={statusFilter||"all"} onValueChange={v=>{setStatusFilter(!v||v==="all"?"":v); setPage(1)}}><SelectTrigger className="w-35 h-9"><SelectValue placeholder="状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="unused">未使用</SelectItem><SelectItem value="used">已使用</SelectItem></SelectContent></Select><Select value={batchFilter||"all"} onValueChange={v=>{setBatchFilter(!v||v==="all"?"":v); setPage(1)}}><SelectTrigger className="w-50 h-9"><SelectValue placeholder="批次" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{batches.map(b=><SelectItem key={b} value={b}>{b.slice(0,8)}...</SelectItem>)}</SelectContent></Select><div className="hidden sm:block flex-1" /><Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />导出 CSV</Button></>}>
      <Card><CardContent className="p-0"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left font-medium">激活码</th><th className="p-3 text-left font-medium">状态</th><th className="p-3 text-left font-medium">有效期</th><th className="p-3 text-left font-medium">批次</th><th className="p-3 text-left font-medium">使用者</th><th className="p-3 text-left font-medium">使用时间</th><th className="p-3 text-left font-medium">创建时间</th></tr></thead>
        <tbody>{codes.map(c=><tr key={c.id} className="border-b hover:bg-muted/30"><td className="p-3 font-mono text-sm whitespace-nowrap">{formatCode(c.code)}</td><td className="p-3"><Badge variant={c.status==="used"?"default":"secondary"}>{c.status==="used"?"已使用":"未使用"}</Badge></td><td className="p-3 text-muted-foreground">{c.durationDays}天</td><td className="p-3 text-muted-foreground">{c.batchNote||"-"}</td><td className="p-3 text-muted-foreground">{c.user?.email||"-"}</td><td className="p-3 text-muted-foreground">{c.usedAt?new Date(c.usedAt).toLocaleString("zh-CN"):"-"}</td><td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("zh-CN")}</td></tr>)}</tbody></table></CardContent></Card>
    </AdminPageShell>
  )
}
function StatCard2({title,value}:{title:string;value:number|string|undefined}){return<Card><CardHeader className="flex items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader><CardContent>{value!==undefined?<p className="text-2xl font-bold text-nowrap">{typeof value==="number"?value.toLocaleString():value}</p>:<Skeleton className="h-8 w-16" />}</CardContent></Card>}
function GenForm({onSuccess}:{onSuccess:()=>void}){const[qty,setQty]=React.useState("50");const[dur,setDur]=React.useState("14");const[note,setNote]=React.useState("");const[loading,setLoading]=React.useState(false);const[err,setErr]=React.useState<string|null>(null);const[result,setResult]=React.useState<{count:number;durationDays:number}|null>(null)
  async function submit(e:React.FormEvent){e.preventDefault();const n=parseInt(qty);const d=parseInt(dur);if(!n||n<1||n>500){setErr("数量1-500");return}if(!d||d<1||d>3650){setErr("天数1-3650");return}
    setLoading(true);setErr(null);try{const r=await generateActivationCodes(n,d,note||undefined);setResult({count:r.data.count,durationDays:r.data.durationDays});setTimeout(()=>onSuccess(),1500)}catch(e){setErr(e instanceof Error?e.message:"失败")}finally{setLoading(false)}}
  if(result)return<div className="text-center py-6"><CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3"/><p className="text-lg font-medium">已生成{result.count}个</p></div>
  return<><DialogHeader><DialogTitle>生成激活码</DialogTitle><DialogDescription>批量生成激活码</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div><Label>数量(1-500)</Label><Input type="number" min={1} max={500} value={qty} onChange={e=>setQty(e.target.value)}/></div><div><Label>有效天数</Label><Input type="number" min={1} max={3650} value={dur} onChange={e=>setDur(e.target.value)}/></div><div><Label>批次备注</Label><Textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}/></div><Button type="submit" disabled={loading} className="w-full">{loading&&<Loader2 className="h-4 w-4 animate-spin mr-2"/>}生成</Button>{err&&<p className="text-sm text-destructive">{err}</p>}</form></>}
