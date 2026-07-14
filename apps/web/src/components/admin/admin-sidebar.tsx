"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"
import {
  LayoutDashboard,
  Users,
  KeyRound,
  FileText,
  Rss,
  Settings,
  BookOpen,
  LogOut,
  Bot,
  Target,
  Compass,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useAdminStore } from "@/lib/admin-store"
import { adminLogout } from "@/lib/api/admin-client"

const navItems = [
  { title: "仪表盘", titleEn: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "智能体管理", titleEn: "Agents", href: "/admin/agents", icon: Bot },
  { title: "IP操盘方法论", titleEn: "Methodology", href: "/admin/methodology", icon: Compass },
  { title: "用户管理", titleEn: "Users", href: "/admin/users", icon: Users },
  { title: "激活码", titleEn: "Activation Codes", href: "/admin/activation-codes", icon: KeyRound },
  { title: "知识库", titleEn: "Knowledge", href: "/admin/knowledge", icon: BookOpen },
  { title: "真实档案", titleEn: "Profiles", href: "/admin/benchmark-profiles", icon: Target },
  { title: "内容模板", titleEn: "Templates", href: "/admin/templates", icon: FileText },
  { title: "热点信源", titleEn: "Hot Sources", href: "/admin/hot-sources", icon: Rss },
  { title: "系统设置", titleEn: "Settings", href: "/admin/settings", icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const { admin, clearSession } = useAdminStore()
  const branding = useBranding()

  async function handleLogout() {
    try {
      await adminLogout()
    } finally {
      clearSession()
      toast.success("已退出登录")
      router.replace("/admin/login")
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/admin" className="flex items-center gap-3 cursor-pointer">
          <BrandLogo className="h-8 w-8 rounded-md" />
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-bold">{branding.name}</span>
            <span className="text-xs text-muted-foreground">管理后台</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>管理 Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={
                      item.href === "/admin"
                        ? pathname === "/admin"
                        : pathname.startsWith(item.href)
                    }
                    className="cursor-pointer"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">{item.titleEn}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {admin && (
          <div className="flex flex-col gap-2">
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{admin.name}</span>
                <Badge variant="secondary" className="w-fit text-xs">
                  {admin.role}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="cursor-pointer"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
