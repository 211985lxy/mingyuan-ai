"use client"

import React from "react"
import Link from "next/link"
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import {
  getAdminUsers,
  getAdminUserStats,
  type AdminUserItem,
  type UserStats,
} from "@/lib/api/admin-client"

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  basic: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
}

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AdminUserItem[]>([])
  const [stats, setStats] = React.useState<UserStats | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [planFilter, setPlanFilter] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const pageSize = 20

  const fetchUsers = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminUsers({ page, pageSize, search, plan: planFilter })
      setUsers(res.data.results)
      setTotal(res.data.total)
    } catch (error) {
      console.error(error)
      setUsers([])
      setTotal(0)
      toast.error(error instanceof Error ? error.message : "用户列表加载失败，请重试")
    } finally {
      setLoading(false)
    }
  }, [page, search, planFilter])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers()
  }, [fetchUsers])

  React.useEffect(() => {
    getAdminUserStats()
      .then((res) => setStats(res.data))
      .catch((error) => {
        console.error(error)
        setStats(null)
        toast.error(error instanceof Error ? error.message : "用户统计加载失败")
      })
  }, [])

  const totalPages = Math.ceil(total / pageSize)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchUsers()
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="用户管理"
        description="查看用户套餐、使用情况与注册信息，必要时进入详情处理单个用户。"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="用户总数"
          value={stats?.total}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        {stats?.byPlan.map((p) => (
          <StatCard
            key={p.plan}
            title={`${{ free: "免费", basic: "基础", pro: "专业" }[p.plan] || p.plan} 套餐`}
            value={p.count}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
        ))}
        <StatCard
          title="本周新增"
          value={stats?.newThisWeek}
          icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索用户名或邮箱..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" className="cursor-pointer">
            搜索
          </Button>
        </form>
        <Select
          value={planFilter}
          onValueChange={(v) => {
            const nextValue = v ?? "all"
            setPlanFilter(nextValue === "all" ? "" : nextValue)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="全部套餐" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部套餐</SelectItem>
            <SelectItem value="free">免费</SelectItem>
            <SelectItem value="basic">基础</SelectItem>
            <SelectItem value="pro">专业</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">名称</th>
                  <th className="text-left p-3 font-medium">邮箱</th>
                  <th className="text-left p-3 font-medium">套餐</th>
                  <th className="text-right p-3 font-medium">生成稿</th>
                  <th className="text-left p-3 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      未找到用户
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b hover:bg-muted/30 transition-colors duration-150"
                    >
                      <td className="p-3">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="font-medium text-primary hover:underline cursor-pointer"
                        >
                          {user.name}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{user.email}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={PLAN_COLORS[user.plan] || ""}>
                          {user.plan}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">{user._count.aimGenerations}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}，共 {total} 条
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string
  value: number | undefined
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {value !== undefined ? (
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        ) : (
          <Skeleton className="h-8 w-16" />
        )}
      </CardContent>
    </Card>
  )
}
