"use client"

import { RouteErrorState } from "@/components/layout/route-states"

/** 数字人工坊错误兜底：重试失败后引导回工坊首页。 */
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorState digest={error.digest ?? null} onRetry={reset} homeHref="/studio" />
}
