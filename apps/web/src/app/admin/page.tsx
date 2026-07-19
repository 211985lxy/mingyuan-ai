"use client"

import React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Users,
  Sparkles,
  KeyRound,
  FileText,
  ArrowRight,
  TrendingUp,
  RotateCw,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  ListChecks,
  Activity,
  Target,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAdminUserStats, getActivationCodeStats, type UserStats, type CodeStats } from "@/lib/api/admin-client"
import {
  MetricCard,
  PendingCard,
  StatusCard,
  SummarySkeleton,
} from "@/components/admin/admin-dashboard-cards"

interface DashboardData {
  totalUsers: number
  generationsToday: number
  activeTemplates: number
  hotListHealth: {
    successLast24h: number
    failedLast24h: number
  }
  pendingKnowledgeCount?: number
  failedEmbeddingCount?: number
  pendingProfilesCount?: number
  recentFailedTraces?: number
}

type LoadState<T> = { status: "loading"; data: null } | { status: "error"; data: null } | { status: "ok"; data: T }

export default function AdminDashboardPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const tabParam = searchParams.get("tab")
  const defaultTab = tabParam === "pending" ? "pending" : tabParam === "status" ? "status" : "overview"
  const [activeTab, setActiveTab] = React.useState(defaultTab)

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

  // Sync the tab parameter from URL on mount
  React.useEffect(() => {
    if (tabParam === "pending") setActiveTab("pending")
    else if (tabParam === "status") setActiveTab("status")
    else setActiveTab("overview")
  }, [tabParam])

  const anyError = dashboard.status === "error" || codeStats.status === "error" || userStats.status === "error"
  const pendingCount = (dashboard.data?.pendingKnowledgeCount ?? 0) +
    (dashboard.data?.failedEmbeddingCount ?? 0) +
    (dashboard.data?.pendingProfilesCount ?? 0) +
    (dashboard.data?.recentFailedTraces ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">工作台</h1>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          刷新
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="cursor-pointer">
            <Activity className="h-4 w-4 mr-1" />
            总览
          </TabsTrigger>
          <TabsTrigger value="pending" className="cursor-pointer relative">
            <ListChecks className="h-4 w-4 mr-1" />
            待处理
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {pendingCount > 99 ? "99+" : pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="status" className="cursor-pointer">
            <Activity className="h-4 w-4 mr-1" />
            系统状态
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════ 总览 Tab ════════════════════ */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="用户总数"
              state={dashboard.status === "ok" ? { status: "ok", value: dashboard.data?.totalUsers } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
              icon={<Users className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              title="今日生成"
              state={dashboard.status === "ok" ? { status: "ok", value: dashboard.data?.generationsToday } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
              icon={<Sparkles className="h-5 w-5 text-primary" />}
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
                <Link href="/admin/knowledge" className="block">
                  <Button variant="outline" className="w-full justify-start cursor-pointer">
                    <BookOpen className="h-4 w-4 mr-2" />
                    管理知识库
                  </Button>
                </Link>
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
                <Link href="/admin/agents" className="block">
                  <Button variant="outline" className="w-full justify-start cursor-pointer">
                    <Bot className="h-4 w-4 mr-2" />
                    执行观测
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════════════════ 待处理 Tab ════════════════════ */}
        <TabsContent value="pending" className="space-y-6 mt-6">
          <p className="text-sm text-muted-foreground">
            以下是需要关注和处理的系统事项。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PendingCard
              icon={<BookOpen className="h-5 w-5 text-amber-600" />}
              title="待整理知识"
              count={dashboard.data?.pendingKnowledgeCount ?? 0}
              description="未标注价值分级或待清洗的知识条目"
              href="/admin/knowledge"
            />
            <PendingCard
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              title="向量化失败"
              count={dashboard.data?.failedEmbeddingCount ?? 0}
              description="嵌入处理失败的知识条目"
              href="/admin/knowledge"
            />
            <PendingCard
              icon={<Target className="h-5 w-5 text-blue-600" />}
              title="待审核档案"
              count={dashboard.data?.pendingProfilesCount ?? 0}
              description="待审核或需更新的真实档案"
              href="/admin/benchmark-profiles"
            />
            <PendingCard
              icon={<XCircle className="h-5 w-5 text-red-600" />}
              title="近24h异常执行"
              count={dashboard.data?.recentFailedTraces ?? 0}
              description="智能体执行失败的请求"
              href="/admin/agents"
            />
          </div>
          {pendingCount === 0 && dashboard.status === "ok" && (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg font-medium text-foreground">暂无待处理事项</p>
                <p className="text-sm text-muted-foreground mt-1">所有系统模块运行正常。</p>
              </CardContent>
            </Card>
          )}
          {dashboard.status === "loading" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ════════════════════ 系统状态 Tab ════════════════════ */}
        <TabsContent value="status" className="space-y-6 mt-6">
          <p className="text-sm text-muted-foreground">
            系统各模块运行状态概览。
          </p>
          <div className="grid grid-cols-1 gap-4">
            <StatusCard
              title="知识库"
              icon={<BookOpen className="h-5 w-5 text-primary" />}
              items={[
                { label: "总条目", value: dashboard.data?.pendingKnowledgeCount ?? "—" },
                { label: "向量化失败", value: dashboard.data?.failedEmbeddingCount ?? "—", variant: (dashboard.data?.failedEmbeddingCount ?? 0) > 0 ? "destructive" as const : "default" as const },
              ]}
            />
            <StatusCard
              title="智能体"
              icon={<Bot className="h-5 w-5 text-primary" />}
              items={[
                { label: "今日生成", value: dashboard.data?.generationsToday ?? "—" },
                { label: "异常 (24h)", value: dashboard.data?.recentFailedTraces ?? "—", variant: (dashboard.data?.recentFailedTraces ?? 0) > 0 ? "destructive" as const : "default" as const },
              ]}
            />
            <StatusCard
              title="热点抓取"
              icon={<Activity className="h-5 w-5 text-primary" />}
              items={[
                { label: "成功 (24h)", value: dashboard.data?.hotListHealth.successLast24h ?? "—", variant: "default" as const },
                ...((dashboard.data?.hotListHealth.failedLast24h ?? 0) > 0 ? [{ label: "失败 (24h)", value: dashboard.data?.hotListHealth.failedLast24h ?? "—", variant: "destructive" as const }] : []),
              ]}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
