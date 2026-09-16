"use client"

import { RouteErrorState } from "@/components/layout/route-states"

/** 工作台段错误兜底：替代 Next 默认错误页，给用户明确的重试出口。 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorState digest={error.digest ?? null} onRetry={reset} />
}
