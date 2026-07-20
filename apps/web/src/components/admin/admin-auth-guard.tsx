"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAdminStore } from "@/lib/admin-store"
import { Skeleton } from "@/components/ui/skeleton"
import { getCurrentAdmin } from "@/lib/api/admin-client"

/**
 * @description adminauthguard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, sessionChecked, isHydrated, setSession, clearSession } = useAdminStore()
  const router = useRouter()

  useEffect(() => {
    if (!isHydrated || sessionChecked) return
    getCurrentAdmin()
      .then(({ admin }) => setSession(admin))
      .catch(() => {
        clearSession()
        router.replace("/admin/login")
      })
  }, [isHydrated, sessionChecked, setSession, clearSession, router])

  // 未 hydrate 完成时，显示与后台布局一致的骨架屏，避免整页白屏闪烁。
  // （localStorage persist 通常很快，但慢存储/低端机上会有可见的空白闪现。）
  if (!isHydrated || !sessionChecked) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 shrink-0 border-r p-4 md:block">
          <Skeleton className="mb-4 h-8 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="mb-6 h-8 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
