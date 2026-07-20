import type React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * @description summaryskeleton
 * @param options - 配置选项
 * @returns 无返回值
 */
export function SummarySkeleton({ failed }: { failed: boolean }) {
  if (failed) {
    return <p className="py-2 text-sm text-muted-foreground">加载失败，请刷新重试。</p>
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

/**
 * @description metriccard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function MetricCard({ title, state, icon }: { title: string; state: MetricState; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {state.status === "loading" ? <Skeleton className="mt-1 h-7 w-12" /> : state.status === "error" ? (
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

/**
 * @description pendingcard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function PendingCard({ icon, title, count, description, href }: {
  icon: React.ReactNode
  title: string
  count: number
  description: string
  href: string
}) {
  return (
    <Link href={href}>
      <Card className="h-full cursor-pointer transition-colors hover:border-primary/30">
        <CardContent className="flex items-start gap-4 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{title}</p>
              <Badge variant={count > 0 ? "destructive" : "secondary"} className="text-xs">{count}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}

/**
 * @description statuscard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function StatusCard({ title, icon, items }: {
  title: string
  icon: React.ReactNode
  items: Array<{ label: string; value: string | number; variant?: "default" | "destructive" | "secondary" | "warning" }>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        {icon}
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <Badge variant={(item.variant as "default" | "secondary" | "destructive" | "outline" | null) ?? "default"} className={item.variant === "warning" ? "bg-amber-100 text-amber-700 border-amber-200" : ""}>{item.value}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
