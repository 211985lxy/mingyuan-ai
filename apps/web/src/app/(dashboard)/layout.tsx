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
        <main className="flex-1 min-w-0 min-h-screen">
          <header className="flex items-center border-b px-4 h-14 gap-3 min-w-0">
            <SidebarTrigger className="shrink-0" />
          </header>
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </SidebarProvider>
    </AuthGuard>
  )
}
