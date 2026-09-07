"use client"

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AuthGuard } from "@/components/layout/auth-guard"
import { OrgProvider } from "@/components/org/org-provider"
import { useSessionVerify } from "@/hooks/use-session-verify"
import { useAuthStore } from "@/lib/store"

/** Step⑤：把当前登录用户（若有）映射进组织上下文，供侧栏显性化组织角色。 */
function OrgBoundary({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  return <OrgProvider currentUserEmail={user?.email ?? null}>{children}</OrgProvider>
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useSessionVerify()

  return (
    <AuthGuard>
      <OrgBoundary>
        <SidebarProvider>
          <AppSidebar />
          <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
            <header className="flex h-9 shrink-0 items-center gap-2 px-2 md:px-3">
              <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground" />
            </header>
            <div className="min-w-0 flex-1 p-3 md:p-4">{children}</div>
          </main>
        </SidebarProvider>
      </OrgBoundary>
    </AuthGuard>
  )
}
