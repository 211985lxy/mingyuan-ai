"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard"
import { useAdminStore } from "@/lib/admin-store"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const isLoginPage = pathname === "/admin/login"

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <AdminAuthGuard>
      <SidebarProvider>
        <AdminSidebar />
        <main className="flex-1 min-w-0 min-h-screen">
          <header className="flex items-center justify-between border-b px-4 h-14 gap-3 min-w-0">
            <SidebarTrigger className="shrink-0" />
            <AdminHeaderInfo />
          </header>
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </SidebarProvider>
    </AdminAuthGuard>
  )
}

function AdminHeaderInfo() {
  const admin = useAdminStore((s) => s.admin)
  if (!admin) return null
  return (
    <span className="text-sm text-muted-foreground truncate min-w-0 max-w-[200px] sm:max-w-none">
      {admin.email}
    </span>
  )
}
