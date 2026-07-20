"use client"

import React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
  ListChecks,
  Activity,
  Target,
  ScrollText,
  Globe,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MetricCard,
  PendingCard,
  StatusCard,
  SummarySkeleton,
} from "@/components/admin/admin-dashboard-cards"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

interface DashboardData {
  totalUsers: number
  generationsToday: number
  activeTemplates: number
  hotListHealth: {
    successLast24h: number
    failedLast24h: number
  }
  pendingKnowledgeCount: number
  failedEmbeddingCount: number
  pendingProfilesCount: number
  recentFailedTraces: number
  codeStats: {
    total: number
    unused: number
    used: number
    usageRate: number
  }
  recentUsers: Array<{
    id: string
    name: string
    email: string
    plan: string
    createdAt: string
  }>
  recentLogs: Array<{
    id: string
    action: string
    targetType: string
    targetId: string | null
    createdAt: string
  }>
}

type LoadState<T> = { status: "loading"; data: null } | { status: "error"; data: null } | { status: "ok"; data: T }

export default function AdminDashboardPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const tabParam = searchParams.get("tab")
  const router = useRouter()
  const activeTab = tabParam === "pending" ? "pending" : tabParam === "status" ? "status" : "overview"

  const [dashboard, setDashboard] = React.useState<LoadState<DashboardData>>({ status: "loading", data: null })

  const loadAll = React.useCallback(() => {
    setDashboard({ status: "loading", data: null })

    fetch("/api/admin/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`仪表盘数据加载失败 (${r.status})`))))
      .then((r) => setDashboard({ status: "ok", data: r?.data ?? null }))
      .catch((err) => {
        setDashboard({ status: "error", data: null })
        toast.error(err instanceof Error ? err.message : "仪表盘数据加载失败")
      })
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  function handleTabChange(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextTab === "overview") params.delete("tab")
    else params.set("tab", nextTab)
    router.replace(params.size ? `/admin?${params.toString()}` : "/admin")
  }

  const data = dashboard.data
  const anyError = dashboard.status === "error"
  const pendingCount = (data?.pendingKnowledgeCount ?? 0) +
    (data?.failedEmbeddingCount ?? 0) +
    (data?.pendingProfilesCount ?? 0) +
    (data?.recentFailedTraces ?? 0)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="工作台"
        description="从待处理事项、业务概览和系统状态开始，快速进入下一步操作。"
        actions={<Button variant="outline" size="sm" onClick={loadAll}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          刷新
        </Button>}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
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
              state={dashboard.status === "ok" ? { status: "ok", value: data?.totalUsers } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
              icon={<Users className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              title="今日生成"
              state={dashboard.status === "ok" ? { status: "ok", value: data?.generationsToday } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
              icon={<Sparkles className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              title="活跃模板"
              state={dashboard.status === "ok" ? { status: "ok", value: data?.activeTemplates } : dashboard.status === "error" ? { status: "error" } : { status: "loading" }}
              icon={<FileText className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              title="激活码"
              state={
                dashboard.status === "ok" && data?.codeStats
                  ? { status: "ok", value: data.codeStats.total, subtitle: `${data.codeStats.unused} 未使用` }
                  : dashboard.status === "error"
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
                {dashboard.status === "ok" ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      共 {data?.totalUsers?.toLocaleString() ?? 0} 名用户
                    </p>
                    {data?.recentUsers && data.recentUsers.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground">最近注册</p>
                        {data.recentUsers.map((u) => (
                          <Link key={u.id} href={`/admin/users/${u.id}`}
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors">
                            <span className="font-medium truncate">{u.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <SummarySkeleton failed={dashboard.status === "error"} />
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
                {dashboard.status === "ok" && data?.codeStats ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">总码数</span>
                      <span className="font-medium">{data.codeStats.total}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">未使用</span>
                      <span className="font-medium">{data.codeStats.unused}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">已使用</span>
                      <span className="font-medium">{data.codeStats.used}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">使用率</span>
                      <span className="font-medium">{data.codeStats.usageRate}%</span>
                    </div>
                  </div>
                ) : (
                  <SummarySkeleton failed={dashboard.status === "error"} />
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">最近操作</CardTitle>
                <Link href="/admin/logs">
                  <Button variant="ghost" size="sm" className="cursor-pointer">
                    查看全部 <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {dashboard.status === "ok" ? (
                  data?.recentLogs && data.recentLogs.length > 0 ? (
                    <div className="space-y-2">
                      {data.recentLogs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{log.action}</Badge>
                            <span className="text-muted-foreground truncate">{log.targetType}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {new Date(log.createdAt).toLocaleString("zh-CN")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground text-center">暂无操作记录</p>
                  )
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
              count={data?.pendingKnowledgeCount ?? 0}
              description="未标注价值分级或待清洗的知识条目"
              href="/admin/knowledge"
            />
            <PendingCard
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              title="向量化失败"
              count={data?.failedEmbeddingCount ?? 0}
              description="嵌入处理失败的知识条目"
              href="/admin/knowledge"
            />
            <PendingCard
              icon={<Target className="h-5 w-5 text-blue-600" />}
              title="待审核档案"
              count={data?.pendingProfilesCount ?? 0}
              description="待补充客户资料的真实档案"
              href="/admin/benchmark-profiles"
            />
            <PendingCard
              icon={<XCircle className="h-5 w-5 text-red-600" />}
              title="近24h异常执行"
              count={data?.recentFailedTraces ?? 0}
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
                { label: "待整理", value: data?.pendingKnowledgeCount ?? "—", variant: (data?.pendingKnowledgeCount ?? 0) > 0 ? "warning" as const : "default" as const },
                { label: "向量化失败", value: data?.failedEmbeddingCount ?? "—", variant: (data?.failedEmbeddingCount ?? 0) > 0 ? "destructive" as const : "default" as const },
              ]}
            />
            <StatusCard
              title="智能体"
              icon={<Bot className="h-5 w-5 text-primary" />}
              items={[
                { label: "今日生成", value: data?.generationsToday ?? "—" },
                { label: "异常 (24h)", value: data?.recentFailedTraces ?? "—", variant: (data?.recentFailedTraces ?? 0) > 0 ? "destructive" as const : "default" as const },
              ]}
            />
            <StatusCard
              title="真实档案"
              icon={<Target className="h-5 w-5 text-primary" />}
              items={[
                { label: "待补充", value: data?.pendingProfilesCount ?? "—", variant: (data?.pendingProfilesCount ?? 0) > 0 ? "warning" as const : "default" as const },
              ]}
            />
            <StatusCard
              title="热点抓取"
              icon={<Globe className="h-5 w-5 text-primary" />}
              items={[
                { label: "成功 (24h)", value: data?.hotListHealth.successLast24h ?? "—" },
                ...((data?.hotListHealth.failedLast24h ?? 0) > 0 ? [{ label: "失败 (24h)", value: data?.hotListHealth.failedLast24h ?? "—", variant: "destructive" as const }] : [] as Array<{ label: string; value: string | number; variant?: "default" | "destructive" | "warning" | "secondary" }>),
              ]}
            />
            <StatusCard
              title="激活码"
              icon={<KeyRound className="h-5 w-5 text-primary" />}
              items={[
                { label: "总数", value: data?.codeStats?.total ?? "—" },
                { label: "未使用", value: data?.codeStats?.unused ?? "—" },
                { label: "使用率", value: data?.codeStats ? `${data.codeStats.usageRate}%` : "—" },
              ]}
            />
          </div>
          {dashboard.status === "loading" && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
