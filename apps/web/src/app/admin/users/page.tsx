"use client"
import React from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminUsers, getAdminUserStats, type AdminUserItem, type UserStats } from "@/lib/api/admin-client"
import { AdminPageShell } from "@/components/admin/admin-page-shell"

const PLAN_COLORS: Record<string, string> = { free: "bg-gray-100 text-gray-700", basic: "bg-blue-100 text-blue-700", pro: "bg-purple-100 text-purple-700" }

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AdminUserItem[]>([]); const [stats, setStats] = React.useState<UserStats | null>(null)
  const [total, setTotal] = React.useState(0); const [page, setPage] = React.useState(1); const [search, setSearch] = React.useState(""); const [planFilter, setPlanFilter] = React.useState("")
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null); const pageSize = 20
  const fetchUsers = React.useCallback(async () => {
    setLoading(true); setError(null)
    try { const res = await getAdminUsers({ page, pageSize, search, plan: planFilter }); setUsers(res.data.results); setTotal(res.data.total) }
    catch (err) { const msg = err instanceof Error ? err.message : "加载失败"; setError(msg); toast.error(msg); setUsers([]); setTotal(0) }
    finally { setLoading(false) }
  }, [page, search, planFilter])
  React.useEffect(() => { fetchUsers() }, [fetchUsers])
  React.useEffect(() => { getAdminUserStats().then(r => setStats(r.data)).catch(() => setStats(null)) }, [])
  const totalPages = Math.ceil(total / pageSize)
  return (
    <AdminPageShell title="用户管理" subtitle="管理用户账号和套餐" loading={loading} error={error} onRetry={fetchUsers} skeletonRows={5}
      empty={!loading && !error && users.length === 0} emptyMessage="未找到用户"
      stats={<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><StatCard title="用户总数" value={stats?.total} />{stats?.byPlan.map(p => <StatCard key={p.plan} title={p.plan} value={p.count} />)}<StatCard title="本周新增" value={stats?.newThisWeek} /></div>}
      filter={<><form onSubmit={e => { e.preventDefault(); setPage(1); fetchUsers() }} className="flex items-center gap-2 flex-1 min-w-50 max-w-sm"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="搜索用户..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" /></div><Button type="submit" variant="secondary" size="sm">搜索</Button></form><Select value={planFilter||"all"} onValueChange={v => { setPlanFilter(!v||v==="all"?"":v); setPage(1) }}><SelectTrigger className="w-35 h-9"><SelectValue placeholder="全部套餐" /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="free">免费</SelectItem><SelectItem value="basic">基础</SelectItem><SelectItem value="pro">专业</SelectItem></SelectContent></Select></>}>
      <Card><CardContent className="p-0"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left font-medium">名称</th><th className="p-3 text-left font-medium">邮箱</th><th className="p-3 text-left font-medium">套餐</th><th className="p-3 text-right font-medium">生成稿</th><th className="p-3 text-left font-medium">注册时间</th></tr></thead>
        <tbody>{users.map(u => <tr key={u.id} className="border-b hover:bg-muted/30"><td className="p-3"><Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">{u.name}</Link></td><td className="p-3 text-muted-foreground">{u.email}</td><td className="p-3"><Badge variant="secondary" className={PLAN_COLORS[u.plan]||""}>{u.plan}</Badge></td><td className="p-3 text-right">{u._count.aimGenerations}</td><td className="p-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("zh-CN")}</td></tr>)}</tbody></table></CardContent></Card>
    </AdminPageShell>
  )
}
function StatCard({ title, value }: { title: string; value: number | undefined }) {
  return <Card><CardHeader className="flex items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader><CardContent>{value!==undefined ? <p className="text-2xl font-bold">{value.toLocaleString()}</p> : <Skeleton className="h-8 w-16" />}</CardContent></Card>
}
