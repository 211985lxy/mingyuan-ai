"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  FilePenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  listAimHistory,
  listClientProjects,
  listKnowledge,
  type AimGeneration,
  type ClientProject,
  type KnowledgeEntry,
} from "@/lib/api/client"

function workflowStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    draft: "草稿",
    pending_review: "待审核",
    ready_to_shoot: "待拍摄",
    shooting: "拍摄中",
    editing: "剪辑中",
    ready_to_publish: "待发布",
    published: "已发布",
    archived: "已归档",
  }
  return labels[status || "draft"] || "草稿"
}

function getContentTitle(item: AimGeneration) {
  return item.topicTitle || item.rawInput.slice(0, 42) || "未命名内容"
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [history, setHistory] = useState<AimGeneration[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectData, historyData, knowledgeData] = await Promise.all([
          listClientProjects("all"),
          listAimHistory(1, 6),
          listKnowledge(),
        ])
        setProjects(projectData)
        setHistory(historyData)
        setKnowledge(knowledgeData)
      } catch (error) {
        // 任一请求失败时降级为空数据并提示，避免页面停留在无反馈的空白态
        toast.error(error instanceof Error ? error.message : "数据加载失败，请刷新重试")
        setProjects([])
        setHistory([])
        setKnowledge([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active"),
    [projects]
  )

  const pendingItems = useMemo(
    () => history.filter((item) => item.workflowStatus !== "published" && item.workflowStatus !== "archived"),
    [history]
  )

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-6 pb-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">工作总览</h1>
          <Badge className="badge-gold border-none px-2 py-0.5 rounded-sm text-xs">内容生产版</Badge>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          管理全案、沉淀素材、生成内容，并跟进每一条内容的生产进度。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs text-muted-foreground">进行中全案</p>
              <p className="mt-2 text-3xl font-bold">{activeProjects.length}</p>
            </div>
            <BriefcaseBusiness className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs text-muted-foreground">待推进内容</p>
              <p className="mt-2 text-3xl font-bold">{pendingItems.length}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs text-muted-foreground">知识库条目</p>
              <p className="mt-2 text-3xl font-bold">{knowledge.length}</p>
            </div>
            <BookOpen className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-amber-500/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />
              商业诊断官
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              先判断生意卡点：商业模式、流量转化、交付结构和核心矛盾。
            </p>
            <Button className="w-full" nativeButton={false} render={<Link href="/aim?agent=business_system_diagnosis" />}>
              去做诊断
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-amber-500/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              定位策划官
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              明确 IP 怎么表达、吸引谁、建立什么信任，以及如何承接成交。
            </p>
            <Button className="w-full" nativeButton={false} render={<Link href="/aim?agent=business_diagnosis" />}>
              去做定位
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-amber-500/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FilePenLine className="h-4 w-4 text-primary" />
              内容生产官
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              统一处理选题、脚本、朋友圈、长文和发布前质检。
            </p>
            <Button className="w-full" nativeButton={false} render={<Link href="/aim?agent=content_producer" />}>
              去生产内容
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-amber-500/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              发布质检官
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              发布前检查成稿质量、平台风险和最小修改建议。
            </p>
            <Button className="w-full" nativeButton={false} render={<Link href="/aim?agent=content_review" />}>
              去做质检
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">最近待推进内容</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 opacity-40" />
                <p className="text-sm">暂无待推进内容</p>
              </div>
            ) : (
              <div className="divide-y">
                {pendingItems.slice(0, 6).map((item) => (
                  <Link key={item.id} href="/aim" className="block p-4 transition-colors hover:bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <p className="line-clamp-1 text-sm font-semibold">{getContentTitle(item)}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{item.rawInput}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {workflowStatusLabel(item.workflowStatus)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
