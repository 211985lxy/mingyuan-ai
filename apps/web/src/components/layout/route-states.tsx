"use client"

import Link from "next/link"
import { AlertTriangle, Compass, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * 路由级兜底视觉：错误态与 404 共用同一套品牌化外壳。
 * 供 app/(dashboard)、app/(studio) 及各段 error.tsx / not-found.tsx 复用，
 * 避免每条路由各写一遍。
 */
function RouteFallbackShell({
  icon,
  title,
  description,
  actions,
  detail,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actions: React.ReactNode
  detail?: string | null
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </span>
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
          {detail ? (
            <p className="text-xs text-muted-foreground/70" title={detail}>
              排查编号：{detail}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

/** 出错了：给重试与返回，不把技术堆栈暴露给用户（编号留给排查）。 */
export function RouteErrorState({
  digest,
  onRetry,
  homeHref = "/home",
}: {
  digest?: string | null
  onRetry: () => void
  homeHref?: string
}) {
  return (
    <RouteFallbackShell
      icon={<AlertTriangle className="h-5 w-5" />}
      title="这一步没走通"
      description="刚才的操作失败了，通常是网络或服务临时波动。重新试一次一般就好。"
      detail={digest ?? null}
      actions={
        <>
          <Button onClick={onRetry}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            重试
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={homeHref} />}>
            返回创作台
          </Button>
        </>
      }
    />
  )
}

/** 404：给明确出口，不留死路。 */
export function RouteNotFoundState({
  homeHref = "/home",
  homeLabel = "返回创作台",
}: {
  homeHref?: string
  homeLabel?: string
}) {
  return (
    <RouteFallbackShell
      icon={<Compass className="h-5 w-5" />}
      title="这个页面不存在"
      description="链接可能已经失效，或者内容已被移走。"
      actions={
        <>
          <Button nativeButton={false} render={<Link href={homeHref} />}>
            {homeLabel}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/studio" />}>
            去数字人工坊
          </Button>
        </>
      }
    />
  )
}
