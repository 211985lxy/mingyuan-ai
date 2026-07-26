"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"
import {
  LayoutDashboard,
  ListChecks,
  Activity,
  BookOpen,
  Target,
  FileText,
  Rss,
  Bot,
  Compass,
  FlaskConical,
  Users,
  KeyRound,
  Receipt,
  Settings,
  ScrollText,
  LogOut,
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

interface NavItem {
  title: string
  titleEn: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  labelEn: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "工作台",
    labelEn: "Workspace",
    items: [
      { title: "总览", titleEn: "Overview", href: "/admin", icon: LayoutDashboard },
      { title: "待处理事项", titleEn: "Pending", href: "/admin?tab=pending", icon: ListChecks },
      { title: "系统状态", titleEn: "Status", href: "/admin?tab=status", icon: Activity },
    ],
  },
  {
    label: "内容资产",
    labelEn: "Content Assets",
    items: [
      { title: "知识库", titleEn: "Knowledge", href: "/admin/knowledge", icon: BookOpen },
      { title: "真实档案", titleEn: "Profiles", href: "/admin/benchmark-profiles", icon: Target },
      { title: "内容模板", titleEn: "Templates", href: "/admin/templates", icon: FileText },
      { title: "热点信源", titleEn: "Hot Sources", href: "/admin/hot-sources", icon: Rss },
    ],
  },
  {
    label: "智能体",
    labelEn: "AI Agents",
    items: [
      { title: "智能体", titleEn: "Agents", href: "/admin/agents", icon: Bot },
      { title: "系统方法论", titleEn: "System Methodology", href: "/admin/methodology", icon: Compass },
      { title: "命名方法论", titleEn: "Named Methodology", href: "/admin/methodology-profiles", icon: BookOpen },
      { title: "检索测试", titleEn: "Retrieval Test", href: "/admin/retrieval-test", icon: FlaskConical },
    ],
  },
  {
    label: "运营管理",
    labelEn: "Operations",
    items: [
      { title: "用户", titleEn: "Users", href: "/admin/users", icon: Users },
      { title: "激活码", titleEn: "Codes", href: "/admin/activation-codes", icon: KeyRound },
      { title: "使用记录", titleEn: "Usage", href: "/admin/usage", icon: Receipt },
    ],
  },
  {
    label: "系统",
    labelEn: "System",
    items: [
      { title: "系统设置", titleEn: "Settings", href: "/admin/settings", icon: Settings },
      { title: "操作日志", titleEn: "Audit Log", href: "/admin/logs", icon: ScrollText },
    ],
  },
]

/**
 * @description adminsidebar
 * @returns 无返回值
 */
export function AdminSidebar() {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const { admin, clearSession } = useAdminStore()
  const branding = useBranding()

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin"
    // Handle /admin?tab=pending and /admin?tab=status — highlight "总览" for all /admin
    if (href.startsWith("/admin?tab=")) return pathname === "/admin"
    return pathname.startsWith(href)
  }

  function isExactGroupActive(group: NavGroup): boolean {
    return group.items.some((item) => {
      if (item.href === "/admin" || item.href.startsWith("/admin?tab=")) {
        return pathname === "/admin"
      }
      return pathname.startsWith(item.href)
    })
  }

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
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel
              className={`flex items-center justify-between px-3 ${
                isExactGroupActive(group) ? "text-foreground font-semibold" : ""
              }`}
            >
              <span>{group.label}</span>
              <span className="text-[10px] text-muted-foreground/50 font-normal">{group.labelEn}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive(item.href)}
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
        ))}
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
