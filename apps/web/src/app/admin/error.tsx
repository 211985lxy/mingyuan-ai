"use client"

/**
 * 后台路由级错误边界。
 *
 * 与 app/global-error.tsx 不同，这里保留 admin layout 的外壳（侧边栏 + 顶栏），
 * 仅替换内容区，让操作员在页面渲染异常时仍能导航到其他后台页面。
 * 注意：/admin/login 不在 AdminAuthGuard 内，但本边界会兜住所有 admin 子路由的渲染异常。
 */

import { useEffect } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 上报到控制台，便于排查（生产环境可接入监控）
    console.error("[admin/error] 未捕获的渲染异常:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="mb-1 text-lg font-semibold">页面出了点问题</h2>
      <p className="mb-1 max-w-md text-sm text-muted-foreground">
        系统遇到未预期的错误，请尝试重试。如果问题持续，请联系管理员。
      </p>
      {error?.digest ? (
        <p className="mb-4 text-xs text-muted-foreground/70">错误编号：{error.digest}</p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="flex gap-2">
        <Button onClick={() => reset()}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          重试
        </Button>
        <Button variant="outline" onClick={() => window.location.assign("/admin")}>
          返回仪表盘
        </Button>
      </div>
    </div>
  )
}
