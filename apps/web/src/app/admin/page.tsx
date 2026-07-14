"use client"

import React from "react"
import Link from "next/link"
import {
  Users,
  Video,
  KeyRound,
  FileText,
  ArrowRight,
  TrendingUp,
  RotateCw,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminUserStats, getActivationCodeStats, type UserStats, type CodeStats } from "@/lib/api/admin-client"

interface DashboardData {
  totalUsers: number
  videosToday: number
  activeTemplates: number
  hotListHealth: {
    successLast24h: number
    failedLast24h: number
  }
}

type LoadState<T> = { status: "loading"; data: null } | { status: "error"; data: null } | { status: "ok"; data: T }

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = React.useState<LoadState<DashboardData>>({ status: "loading", data: null })
  const [userStats, setUserStats] = React.useState<LoadState<UserStats>>({ status: "loading", data: null })
  const [codeStats, setCodeStats] = React.useState<LoadState<CodeStats>>({ status: "loading", data: null })

  const loadAll = React.useCallback(() => {
    setDashboard({ status: "loading", data: null })
    setCodeStats({ status: "loading", data: null })
    setUserStats({ status: "loading", data: null })

    fetch("/api/admin/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`仪表盘数据加载失败 (${r.status})`))))
      .then((r) => setDashboard({ status: "ok", data: r?.data ?? null }))
      .catch((err) => {
        setDashboard({ status: "error", data: null })
        toast.error(err instanceof Error ? err.message : "仪表盘数据加载失败")
      })

    getAdminUserStats()
      .then((r) => setUserStats({ status: "ok", data: r.data }))
      .catch((err) => {
        setUserStats({ status: "error", data: null })
        toast.error(err instanceof Error ? err.message : "用户统计加载失败")
      })

    getActivationCodeStats()
      .then((r) => setCodeStats({ status: "ok", data: r.data }))
      .catch((err) => {
        setCodeStats({ status: "error", data: null })
        toast.error(err instanceof Error ? err.message : "激活码统计加载失败")
      })
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  const anyError = dashboard.status === "error" || codeStats.status === "error" || userStats.status === "error"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          刷新
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="用户总数"
          state={dashboard.status === "ok" ? { status: "ok", value: dashboard.data?.totalUsers } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
          icon={<Users className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="今日视频"
          state={dashboard.status === "ok" ? { status: "ok", value: dashboard.data?.videosToday } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
          icon={<Video className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="活跃模板"
          state={dashboard.status === "ok" ? { status: "ok", value: dashboard.data?.activeTemplates } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
          icon={<FileText className="h-5 w-5 text-primary" />}
        />
        <MetricCard
          title="激活码"
          state={
            codeStats.status === "ok"
              ? { status: "ok", value: codeStats.data?.total, subtitle: codeStats.data ? `${codeStats.data.unused} 未使用` : undefined }
              : codeStats.status === "error"
              ? { status: "error" }
              : { status: "loading" }
          }
          icon={<KeyRound className="h-5 w-5 text-primary" />}
        />
      </div>

      {anyError ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>部分数据加载失败，请点击右上角「刷新」重试。</span>
        </div>
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">用户概览</CardTitle>
            <Link href="/admin/users">
              <Button variant="ghost" size="sm" className="cursor-pointer">
                查看全部 <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {userStats.status === "ok" ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">本周新增</span>
                  <span className="font-medium flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-600" />
                    {userStats.data?.newThisWeek ?? 0}
                  </span>
                </div>
                {userStats.data?.byPlan.map((p) => (
                  <div key={p.plan} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground capitalize">{{ free: "免费", basic: "基础", pro: "专业" }[p.plan] || p.plan} 套餐</span>
                    <span className="font-medium">{p.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <SummarySkeleton failed={userStats.status === "error"} />
            )}
          </CardContent>
        </Card>

        {/* Activation Code Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">激活码</CardTitle>
            <Link href="/admin/activation-codes">
              <Button variant="ghost" size="sm" className="cursor-pointer">
                查看全部 <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {codeStats.status === "ok" ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">总码数</span>
                  <span className="font-medium">{codeStats.data?.total ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">未使用</span>
                  <span className="font-medium">{codeStats.data?.unused ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">已使用</span>
                  <span className="font-medium">{codeStats.data?.used ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">使用率</span>
                  <span className="font-medium">{codeStats.data?.usageRate ?? 0}%</span>
                </div>
              </div>
            ) : (
              <SummarySkeleton failed={codeStats.status === "error"} />
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">系统状态</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.status === "ok" && dashboard.data ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">热榜抓取 (24h)</span>
                  <span className="font-medium text-green-600">
                    {dashboard.data.hotListHealth.successLast24h} 成功
                  </span>
                </div>
                {dashboard.data.hotListHealth.failedLast24h > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">失败抓取 (24h)</span>
                    <span className="font-medium text-red-600">
                      {dashboard.data.hotListHealth.failedLast24h}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <SummarySkeleton failed={dashboard.status === "error"} />
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">快捷操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/activation-codes" className="block">
              <Button variant="outline" className="w-full justify-start cursor-pointer">
                <KeyRound className="h-4 w-4 mr-2" />
                生成激活码
              </Button>
            </Link>
            <Link href="/admin/users" className="block">
              <Button variant="outline" className="w-full justify-start cursor-pointer">
                <Users className="h-4 w-4 mr-2" />
                管理用户
              </Button>
            </Link>
            <Link href="/admin/settings" className="block">
              <Button variant="outline" className="w-full justify-start cursor-pointer">
                <FileText className="h-4 w-4 mr-2" />
                系统设置
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummarySkeleton({ failed }: { failed: boolean }) {
  if (failed) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        加载失败，请刷新重试。
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

type MetricState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; value: number | undefined; subtitle?: string }

function MetricCard({
  title,
  state,
  icon,
}: {
  title: string
  state: MetricState
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {state.status === "loading" ? (
            <Skeleton className="mt-1 h-7 w-12" />
          ) : state.status === "error" ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">加载失败</p>
          ) : (
            <>
              <p className="text-2xl font-bold">{state.value?.toLocaleString() ?? 0}</p>
              {state.subtitle ? <p className="text-xs text-muted-foreground">{state.subtitle}</p> : null}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
