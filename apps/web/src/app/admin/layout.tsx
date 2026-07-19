"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard"
import { useAdminStore } from "@/lib/admin-store"

// Module breadcrumb mapping: path prefix → display info
const MODULE_INFO: Record<string, { module: string; description: string }> = {
  "/admin": { module: "工作台", description: "系统总览与待办" },
  "/admin/knowledge": { module: "内容资产", description: "知识库" },
  "/admin/benchmark-profiles": { module: "内容资产", description: "真实档案" },
  "/admin/templates": { module: "内容资产", description: "内容模板" },
  "/admin/hot-sources": { module: "内容资产", description: "热点信源" },
  "/admin/agents": { module: "智能体", description: "智能体与执行观测" },
  "/admin/methodology": { module: "智能体", description: "方法论" },
  "/admin/retrieval-test": { module: "智能体", description: "检索测试" },
  "/admin/users": { module: "运营管理", description: "用户管理" },
  "/admin/activation-codes": { module: "运营管理", description: "激活码管理" },
  "/admin/usage": { module: "运营管理", description: "使用记录" },
  "/admin/settings": { module: "系统", description: "系统设置" },
  "/admin/logs": { module: "系统", description: "操作日志" },
}

function getModuleInfo(pathname: string) {
  // Longest match first
  const keys = Object.keys(MODULE_INFO).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (pathname.startsWith(key)) return MODULE_INFO[key]
  }
  return null
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const isLoginPage = pathname === "/admin/login"
  const moduleInfo = getModuleInfo(pathname)

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <AdminAuthGuard>
      <SidebarProvider>
        <AdminSidebar />
        <main className="flex-1 min-w-0 min-h-screen">
          <header className="flex items-center justify-between border-b px-4 h-14 gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="shrink-0" />
              {moduleInfo && (
                <nav className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                  <span className="font-medium text-foreground">{moduleInfo.module}</span>
                  <span className="text-muted-foreground/40">/</span>
                  <span className="truncate">{moduleInfo.description}</span>
                </nav>
              )}
            </div>
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
