"use client"

import { useEffect } from "react"
import { CalendarDays } from "lucide-react"
import { useRouter } from "next/navigation"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AuthGuard } from "@/components/layout/auth-guard"
import { useAuthStore } from "@/lib/store"
import { ApiError, getCurrentUser } from "@/lib/api/client"
import { getSubscriptionStatus } from "@/lib/subscription"

function formatSubscriptionBadge(expiresAt?: string | null) {
  const status = getSubscriptionStatus(expiresAt ?? null)

  if (status === "inactive") return "未激活"
  if (status === "expired") return "已过期"
  if (!expiresAt) return "未设置"

  return new Date(expiresAt).toLocaleDateString("zh-CN")
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, setSession, clearSession, isHydrated, sessionChecked } = useAuthStore()

  useEffect(() => {
    if (!isHydrated || sessionChecked) return

    getCurrentUser()
      .then((liveUser) => {
        setSession(liveUser)

        if (liveUser.subscriptionStatus !== "active") {
          router.replace("/activate")
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSession()
          router.replace("/login")
          return
        }
      })
  }, [isHydrated, sessionChecked, setSession, clearSession, router])

  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <main className="flex-1 min-w-0 min-h-screen">
          <header className="flex items-center justify-between border-b px-4 h-14 gap-3 min-w-0">
            <SidebarTrigger className="shrink-0" />
            {user && (
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <span className="text-sm text-muted-foreground truncate hidden sm:block">
                  {user.email}
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">到期{" "}</span>
                  <span className="font-medium text-foreground">
                    {formatSubscriptionBadge(user.expiresAt)}
                  </span>
                </span>
              </div>
            )}
          </header>
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </SidebarProvider>
    </AuthGuard>
  )
}
