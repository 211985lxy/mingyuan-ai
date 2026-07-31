"use client"

import Link from "next/link"
import { ArrowRight, FilePenLine, RefreshCw, UserRound, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getContentPreview, getContentTitle } from "@/lib/home-history-summary"
import { deriveAimWorkflowTasks } from "@/features/aim/workflow/tasks"
import { useAimHomeSummary } from "@/features/aim/hooks/use-aim-home-summary"
import { PlatformIntegrationsCard } from "@/features/integrations/components/platform-integrations-card"
import type { AimGeneration } from "@/lib/api/client"

function taskHref(item: AimGeneration) {
  const stage = deriveAimWorkflowTasks([item])[0]?.stage || "content"
  const params = new URLSearchParams({ generationId: item.id, stage })
  if (item.projectId) params.set("projectId", item.projectId)
  else params.set("mode", "quick")
  return `/aim?${params.toString()}`
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


function PendingSection({
  summary,
}: {
  summary: ReturnType<typeof useAimHomeSummary>
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">待推进</h2>
        {summary.pending.data.total > 6 ? (
          <Link href="/aim" className="text-xs text-primary hover:underline">全部</Link>
        ) : null}
      </div>
      <div className="mt-2 divide-y border-y">
        {summary.pending.loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}
        {!summary.pending.loading && !summary.pending.error && summary.pending.data.items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <FilePenLine className="h-4 w-4" />还没有待推进，先出一稿。
          </div>
        ) : null}
        {summary.pending.error ? (
          <div className="py-4">
            <DataError message={summary.pending.error} onRetry={() => void summary.loadPending()} />
          </div>
        ) : null}
        {summary.pending.data.items.map((item) => (
          <Link
            key={item.id}
            href={taskHref(item)}
            className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/25"
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

/** 工作总览：极简——继续上次 / 出稿 / 补资料 / 待推进列表 */
export default function DashboardPage() {
  const summary = useAimHomeSummary()
  const continueItem = summary.pending.data.items[0]
  const asset = summary.accountAsset.data
  const assetLabel = summary.accountAsset.loading
    ? null
    : !asset.projectId
      ? "资料还没装"
      : `${asset.ready}/${asset.total} 已具备`

  return (
    <div className="space-y-8 pb-10">
      <section className="space-y-1">
        <h1 className="text-2xl font-bold">今天做什么？</h1>
        <p className="text-sm text-muted-foreground">知识库装资料，创作台出内容——两件事，不重复。</p>
      </section>

      {continueItem ? (
        <section className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">继续上次</p>
            <p className="mt-1 truncate text-base font-semibold">{getContentTitle(continueItem)}</p>
          </div>
          <Button nativeButton={false} render={<Link href={taskHref(continueItem)} />} className="shrink-0">
            继续 <ArrowRight className="h-4 w-4" />
          </Button>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="border-primary/35">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
            <div>
              <Zap className="h-4 w-4 text-primary" />
              <h2 className="mt-2 text-base font-semibold">出一稿</h2>
              <p className="mt-1 text-sm text-muted-foreground">去创作台写内容。</p>
            </div>
            <Button nativeButton={false} render={<Link href="/aim?mode=quick&stage=content" />}>
              开始写 <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
            <div>
              <UserRound className="h-4 w-4 text-foreground" />
              <h2 className="mt-2 text-base font-semibold">补账户资料</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                去知识库装人设、产品、案例。
                {assetLabel ? (
                  <span className="mt-1 block text-xs text-muted-foreground/90">{assetLabel}</span>
                ) : (
                  <Skeleton className="mt-2 h-3 w-16" />
                )}
              </p>
              {summary.accountAsset.error ? (
                <DataError
                  message={summary.accountAsset.error}
                  onRetry={() => void summary.loadAccountAsset()}
                />
              ) : null}
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href="/knowledge?intent=add-account" />}>
              去知识库 <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <PlatformIntegrationsCard />

      <PendingSection summary={summary} />
    </div>
  )
}
