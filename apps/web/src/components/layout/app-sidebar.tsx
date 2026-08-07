"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"
import {
  BriefcaseBusiness,
  PenLine,
  FileText,
  Plus,
  Users,
  BookOpen,
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
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarAccountMenu } from "@/components/layout/sidebar-account-menu"
import { AimExpertSidebarSection } from "@/components/layout/aim-expert-sidebar-section"
import { cn } from "@/lib/utils"
import {
  isValidAimAgent,
  listVisibleAimAgents,
  type AimAgentId,
} from "@/lib/aim-ui-config"
import {
  getExpandedAgentsSnapshot,
  groupHistoryByAgent,
  isExpertSectionExpanded,
  parseExpandedAgentsSnapshot,
  subscribeExpandedAgents,
  writeExpandedAgentsToStorage,
} from "@/lib/aim-sidebar-history"
import { useAimWorkspaceStore } from "@/lib/aim-workspace-store"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

/** 一级导航：创作台统一开工；爆款拆解保留高频入口 */
const quickNav: NavItem[] = [
  { title: "创作台", href: "/home", icon: PenLine },
  { title: "爆款拆解", href: "/video-copy", icon: FileText },
  { title: "市场洞察", href: "/opportunities", icon: Users },
  { title: "我的项目", href: "/projects", icon: BriefcaseBusiness },
  { title: "我的知识库", href: "/knowledge", icon: BookOpen },
]

/** AIM 专家：与创作台总览共用可见列表（按工作流排序） */
const aimExpertAgentIds: AimAgentId[] = listVisibleAimAgents().map((agent) => agent.id)

function isNavActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const url = new URL(href, "http://local")
  const path = url.pathname
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false

  if (path === "/aim") {
    const expectedAgent = url.searchParams.get("agent")
    const actualAgent = searchParams.get("agent")
    // 「创作台」= 无 agent；「文案创作」等 = 精确匹配 agent
    if (expectedAgent) return actualAgent === expectedAgent
    return !actualAgent
  }

  for (const [key, value] of url.searchParams.entries()) {
    if (searchParams.get(key) !== value) return false
  }
  return true
}

/**
 * Codex 风格侧栏：专家可折叠，最近任务挂在对应专家下。
 */
export function AppSidebar() {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const router = useRouter()
  const branding = useBranding()
  const { setOpenMobile } = useSidebar()

  const isAim = pathname === "/aim"
  const agentParam = searchParams.get("agent")
  const activeExpertId = isAim && isValidAimAgent(agentParam) ? agentParam : null

  const history = useAimWorkspaceStore((s) => s.history)
  const fetchHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const deleteHistory = useAimWorkspaceStore((s) => s.deleteHistory)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)
  const requestNewCopy = useAimWorkspaceStore((s) => s.requestNewCopy)

  const expandedSnapshot = useSyncExternalStore(
    subscribeExpandedAgents,
    getExpandedAgentsSnapshot,
    () => "{}",
  )
  const expandedMap = useMemo(
    () => parseExpandedAgentsSnapshot(expandedSnapshot),
    [expandedSnapshot],
  )

  // 一次拉全量最近记录，再按专家分组（避免每个专家打一次 API）
  useEffect(() => {
    fetchHistory({ force: true }).catch(() => {})
  }, [fetchHistory])

  const closeMobile = () => setOpenMobile(false)

  const historyByAgent = useMemo(
    () => groupHistoryByAgent(history, aimExpertAgentIds),
    [history],
  )

  function setExpertExpanded(agentId: AimAgentId, open: boolean) {
    writeExpandedAgentsToStorage({ ...expandedMap, [agentId]: open })
  }

  function toggleExpert(agentId: AimAgentId) {
    const currentlyOpen = isExpertSectionExpanded(agentId, activeExpertId, expandedMap)
    setExpertExpanded(agentId, !currentlyOpen)
  }

  return (
    <Sidebar className="border-r border-border/40 bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="gap-2 px-3 pb-2 pt-3">
        <Link
          href="/aim"
          onClick={closeMobile}
          className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1 text-foreground hover:bg-foreground/[0.03]"
        >
          <BrandLogo className="h-7 w-7 shrink-0 rounded-md" />
          <span className="truncate text-[15px] font-semibold tracking-tight">{branding.name}</span>
        </Link>

        <button
          type="button"
          onClick={() => {
            requestNewCopy()
            closeMobile()
            router.push("/aim?agent=content_producer")
          }}
          className="flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          新建任务
        </button>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {quickNav.map((item) => {
                const active = isNavActive(pathname, searchParams, item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} onClick={closeMobile} />}
                      isActive={active}
                      className={cn(
                        "h-10 w-full rounded-md px-2.5 text-sm font-normal md:h-9",
                        active
                          ? "bg-foreground/[0.07] font-medium text-foreground"
                          : "text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 opacity-70" />
                      <span className="truncate">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-3 flex min-h-0 flex-1 flex-col p-0">
          <SidebarGroupLabel className="mb-1.5 h-7 shrink-0 px-2.5 text-xs font-medium tracking-wide text-muted-foreground">
            AIM 专家
          </SidebarGroupLabel>
          <SidebarGroupContent className="min-h-0 flex-1">
            <SidebarMenu className="gap-0.5">
              {aimExpertAgentIds.map((agentId) => {
                const open = isExpertSectionExpanded(agentId, activeExpertId, expandedMap)
                return (
                  <AimExpertSidebarSection
                    key={agentId}
                    agentId={agentId}
                    active={activeExpertId === agentId}
                    open={open}
                    items={historyByAgent.get(agentId) ?? []}
                    isAimRoute={isAim}
                    currentAgentParam={agentParam}
                    onToggle={() => toggleExpert(agentId)}
                    onExpandAndNavigate={() => {
                      setExpertExpanded(agentId, true)
                      closeMobile()
                    }}
                    onCloseMobile={closeMobile}
                    onRequestLoad={requestLoad}
                    onDelete={deleteHistory}
                  />
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarAccountMenu
          active={pathname.startsWith("/account")}
          onNavigate={closeMobile}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
