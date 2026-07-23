"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AuthGuard } from "@/components/layout/auth-guard"
import { useAuthStore } from "@/lib/store"
import { ApiError, getCurrentUser } from "@/lib/api/client"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { setSession, clearSession, isHydrated, sessionChecked } = useAuthStore()

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
        <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-11 shrink-0 items-center gap-2 px-3">
            <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground" />
          </header>
          <div className="min-w-0 flex-1 p-4 md:p-5">{children}</div>
        </main>
      </SidebarProvider>
    </AuthGuard>
  )
}
