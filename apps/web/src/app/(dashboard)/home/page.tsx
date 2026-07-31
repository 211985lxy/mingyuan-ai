"use client"

import Link from "next/link"
import { ArrowRight, FilePenLine, Gift, History, PlusCircle, RefreshCw, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useBranding } from "@/components/providers/branding-provider"
import { deriveAimWorkflowTasks } from "@/features/aim/workflow/tasks"
import { useAimHomeSummary } from "@/features/aim/hooks/use-aim-home-summary"
import {
  buildAimAgentHref,
  getAimAgent,
  listVisibleAimAgents,
  type AimAgentMeta,
} from "@/lib/aim-ui-config"
import {
  AIM_WORKFLOW_STATUS_LABELS,
  getAimWorkflowProgress,
  normalizeAimWorkflowStatus,
} from "@/lib/aim/workflow-status"
import { getContentPreview, getContentTitle } from "@/lib/home-history-summary"
import { useAuthStore } from "@/lib/store"
import type { AimGeneration } from "@/lib/api/client"

function taskHref(item: AimGeneration) {
  const stage = deriveAimWorkflowTasks([item])[0]?.stage || "content"
  const params = new URLSearchParams({ generationId: item.id, stage })
  if (item.projectId) params.set("projectId", item.projectId)
  else params.set("mode", "quick")
  return `/aim?${params.toString()}`
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(iso).toLocaleDateString("zh-CN")
}

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 6) return "夜深了"
  if (h < 12) return "早安"
  if (h < 14) return "午安"
  if (h < 18) return "下午好"
  return "晚上好"
}

function DataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onRetry()
      }}
      className="mt-2 inline-flex items-center gap-1 text-xs text-destructive hover:underline"
    >
      <RefreshCw className="h-3 w-3" />
      {message}，重试
    </button>
  )
}

function HeroSection({ userName }: { userName: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-sm md:p-8">
      <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">{greetingByHour()}，今日灵感已就位</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-wide text-foreground sm:text-4xl">
            {userName}，让 AI 为你
            <br className="hidden sm:block" />
            点燃下一篇爆款内容
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            五位专家、一种创作节奏。从诊断、选题到创作、复盘，懂你所需。
          </p>
        </div>
        <Button
          size="lg"
          className="jade-emboss h-11 gap-2 px-5"
          nativeButton={false}
          render={<Link href="/aim?mode=quick&stage=content" />}
        >
          <PlusCircle className="h-4 w-4" />
          开始创作
        </Button>
      </div>
    </section>
  )
}

function ContinueTaskCard({ item }: { item: AimGeneration }) {
  const agent = getAimAgent(item.agentId)
  const Icon = agent.icon
  const progress = getAimWorkflowProgress(item.workflowStatus)
  const statusLabel = AIM_WORKFLOW_STATUS_LABELS[normalizeAimWorkflowStatus(item.workflowStatus)]
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-muted-foreground">继续上次任务</h2>
      </div>
      <Card className="group overflow-hidden transition-all hover:shadow-md">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-lg bg-muted sm:w-36">
            <Icon className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {agent.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {relativeTime(item.updatedAt || item.createdAt)}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">{getContentTitle(item)}</h3>
            <p className="line-clamp-1 text-sm text-muted-foreground">{getContentPreview(item)}</p>
            <div className="pt-1">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            nativeButton={false}
            render={<Link href={taskHref(item)} />}
          >
            继续创作 <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

function ExpertsGrid({ agents }: { agents: AimAgentMeta[] }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">选择你的创作专家</h2>
        <p className="text-sm text-muted-foreground">每位专家都针对一种工作流场景深度训练</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const Icon = agent.icon
          return (
            <Link
              key={agent.id}
              href={buildAimAgentHref(agent.id, { stage: "content" })}
              className="expert-card jade-emboss group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 transition-colors group-hover:bg-primary/10" aria-hidden="true" />
              <div className="relative z-10 mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="relative z-10 mb-1 text-base font-semibold text-foreground">{agent.title}</h3>
              <p className="relative z-10 text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

interface AssetReadiness {
  loading: boolean
  error: string | null
  projectId: string | null
  ready: number
  total: number
  onRetry: () => void
}

function AssetReadinessCard({ loading, error, projectId, ready, total, onRetry }: AssetReadiness) {
  const readyAll = total > 0 && ready >= total
  const label = loading ? null : !projectId ? "资料还没装" : `${ready}/${total} 已具备`
  return (
    <section>
      <div className="atmosphere-card rounded-xl border border-border/60 p-6 backdrop-blur-sm">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {readyAll ? "账户资料已就绪" : "账户资料还在补齐"}
            </h3>
            <div className="text-sm text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  正在读取资料就绪度
                  <Skeleton className="h-3 w-16" />
                </span>
              ) : (
                <>
                  {label ? <span className="gold-ink-narration">{label}</span> : null}
                  ，补齐人设、产品、案例，让专家更懂你。
                </>
              )}
            </div>
            {error ? <DataError message={error} onRetry={onRetry} /> : null}
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-primary/30 text-primary hover:bg-primary/5"
            nativeButton={false}
            render={<Link href="/knowledge?intent=add-account" />}
          >
            去知识库
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}

function PendingSection({
  summary,
}: {
  summary: ReturnType<typeof useAimHomeSummary>
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-muted-foreground">待推进</h2>
      </div>
      <div className="divide-y rounded-xl border border-border bg-card shadow-sm">
        {summary.pending.loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}
        {!summary.pending.loading && !summary.pending.error && summary.pending.data.items.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <FilePenLine className="h-4 w-4" />
            还没有待推进，先出一稿。
          </div>
        ) : null}
        {summary.pending.error ? (
          <div className="p-4">
            <DataError message={summary.pending.error} onRetry={() => void summary.loadPending()} />
          </div>
        ) : null}
        {summary.pending.data.items.map((item) => (
          <Link
            key={item.id}
            href={taskHref(item)}
            className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/25"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{getContentTitle(item)}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{getContentPreview(item)}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function DashboardFooter({ brandName, userName }: { brandName: string; userName: string }) {
  return (
    <footer className="border-t border-border pb-8 pt-6">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          © 2026 {brandName}. 东方美学，智能创作。
        </p>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3 w-3" />
            {userName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gift className="h-3 w-3" />
            {brandName}
          </span>
        </div>
      </div>
    </footer>
  )
}

/** 创作台总览：Hero + 继续上次 + 专家宫格 + 资料就绪度 + 待推进 */
export default function DashboardPage() {
  const summary = useAimHomeSummary()
  const branding = useBranding()
  const user = useAuthStore((s) => s.user)
  const userName = user?.name?.trim() || "你"

  const continueItem = summary.pending.data.items[0]
  const agents = listVisibleAimAgents()
  const asset = summary.accountAsset.data

  return (
    <div className="relative min-h-full">
      <div className="dashboard-ink-wash" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-1 py-6 md:px-4 md:py-8">
        <HeroSection userName="掌柜" />
        {continueItem ? <ContinueTaskCard item={continueItem} /> : null}
        <ExpertsGrid agents={agents} />
        <AssetReadinessCard
          loading={summary.accountAsset.loading}
          error={summary.accountAsset.error}
          projectId={asset.projectId}
          ready={asset.ready}
          total={asset.total}
          onRetry={() => void summary.loadAccountAsset()}
        />
        <PendingSection summary={summary} />
        <DashboardFooter brandName={branding.name} userName={userName} />
      </div>
    </div>
  )
}
