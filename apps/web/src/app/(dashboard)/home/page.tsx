"use client"

import Link from "next/link"
import { ArrowRight, BookOpen, BriefcaseBusiness, CheckCircle2, FilePenLine, FolderPlus, RefreshCw, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getContentPreview, getContentTitle } from "@/lib/home-history-summary"
import { AIM_WORKFLOW_STAGES, type AimWorkflowStage } from "@/lib/aim-workflow"
import { deriveAimWorkflowTasks } from "@/features/aim/workflow/tasks"
import { useAimHomeSummary } from "@/features/aim/hooks/use-aim-home-summary"
import type { AimGeneration } from "@/lib/api/client"

function taskHref(item: AimGeneration) {
  const stage = deriveAimWorkflowTasks([item])[0]?.stage || "content"
  const params = new URLSearchParams({ generationId: item.id, stage })
  if (item.projectId) params.set("projectId", item.projectId)
  else params.set("mode", "quick")
  return `/aim?${params.toString()}`
}

function stageHref(stage: AimWorkflowStage) {
  return `/aim?mode=quick&stage=${stage}`
}

function DataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1 text-xs text-destructive hover:underline">
      <RefreshCw className="h-3 w-3" />
      {message}，重试
    </button>
  )
}

export default function DashboardPage() {
  const summary = useAimHomeSummary()
  const activeProjects = summary.projects.data.filter((project) => project.status === "active")
  const continueItem = summary.pending.data.items[0]

  return (
    <div className="space-y-7 pb-10">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">今天要推进什么？</h1>
          <Badge variant="secondary">AIM 内容工作流</Badge>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">可以先快速出一稿，也可以进入客户全案持续沉淀定位、内容和结果。</p>
      </section>

      {continueItem ? (
        <section className="flex flex-col gap-4 border-y bg-muted/25 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">继续上次任务</p>
            <p className="mt-1 truncate text-base font-semibold">{getContentTitle(continueItem)}</p>
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{getContentPreview(continueItem)}</p>
          </div>
          <Button nativeButton={false} render={<Link href={taskHref(continueItem)} />} className="shrink-0">
            继续推进 <ArrowRight className="h-4 w-4" />
          </Button>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border-primary/35">
          <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
            <div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Zap className="h-4 w-4" /></span>
              <h2 className="mt-3 text-lg font-semibold">快速出一稿</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">不建全案，直接粘贴想法、口述或现有文案，先拿到一版能继续修改的内容。</p>
            </div>
            <Button nativeButton={false} render={<Link href="/aim?mode=quick&stage=content" />}>
              开始快速出稿 <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
            <div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground"><FolderPlus className="h-4 w-4" /></span>
              <h2 className="mt-3 text-lg font-semibold">建立客户全案</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">适合长期运营，把客户资料、选题、内容、发布和复盘放在同一个项目里。</p>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href="/projects?intent=create" />}>
              建立客户全案 <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold">按工作流开始</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {AIM_WORKFLOW_STAGES.map((stage, index) => (
            <Link key={stage.id} href={stageHref(stage.id)} className="group border-l-2 border-border px-3 py-2 transition-colors hover:border-primary hover:bg-muted/30">
              <p className="text-xs text-muted-foreground">{index + 1}</p>
              <p className="mt-1 text-sm font-semibold group-hover:text-primary">{stage.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{stage.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-xs text-muted-foreground">进行中全案</p>{summary.projects.loading ? <Skeleton className="mt-2 h-8 w-10" /> : <p className="mt-2 text-2xl font-bold">{activeProjects.length}</p>}{summary.projects.error ? <DataError message={summary.projects.error} onRetry={() => void summary.loadProjects()} /> : null}</div><BriefcaseBusiness className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-xs text-muted-foreground">待推进内容</p>{summary.pending.loading ? <Skeleton className="mt-2 h-8 w-10" /> : <p className="mt-2 text-2xl font-bold">{summary.pending.data.total}</p>}{summary.pending.error ? <DataError message={summary.pending.error} onRetry={() => void summary.loadPending()} /> : null}</div><CheckCircle2 className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-xs text-muted-foreground">知识库条目</p>{summary.knowledge.loading ? <Skeleton className="mt-2 h-8 w-10" /> : <p className="mt-2 text-2xl font-bold">{summary.knowledge.data}</p>}{summary.knowledge.error ? <DataError message={summary.knowledge.error} onRetry={() => void summary.loadKnowledge()} /> : null}</div><BookOpen className="h-5 w-5 text-primary" /></CardContent></Card>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">最近待推进内容</h2>
          {summary.pending.data.total > 6 ? <Link href="/aim" className="text-xs text-primary hover:underline">查看全部</Link> : null}
        </div>
        <div className="mt-3 divide-y border-y">
          {summary.pending.loading ? <div className="space-y-3 py-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : null}
          {!summary.pending.loading && !summary.pending.error && summary.pending.data.items.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><FilePenLine className="h-4 w-4" />还没有待推进内容，可以先快速出一稿。</div>
          ) : null}
          {summary.pending.data.items.map((item) => (
            <Link key={item.id} href={taskHref(item)} className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/25">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{getContentTitle(item)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{getContentPreview(item)}</p></div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
