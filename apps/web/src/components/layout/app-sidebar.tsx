"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"
import {
  BriefcaseBusiness,
  ChevronDown,
  Layers,
  PenLine,
  FileText,
  Plus,
  Users,
  BookOpen,
  BarChart3,
  AudioLines,
  Zap,
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
import { normalizeAimWorkflowStatus } from "@/lib/aim/workflow-status"
import { useOrg } from "@/components/org/org-provider"
import type { AimGeneration } from "@/lib/api/client"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

/** 主线导航：创作 + 市场洞察/数据（核心经营环节）+ 项目 */
const primaryNav: NavItem[] = [
  { title: "创作台", href: "/home", icon: PenLine },
  { title: "市场洞察", href: "/opportunities", icon: Users },
  { title: "数据看板", href: "/data-platform", icon: BarChart3 },
  { title: "我的项目", href: "/projects", icon: BriefcaseBusiness },
]

/** 工具箱：低频工具页，默认折叠 */
const toolboxNav: NavItem[] = [
  { title: "极简模式", href: "/lite", icon: Zap },
  { title: "爆款拆解", href: "/video-copy", icon: FileText },
  { title: "语音工坊", href: "/voice-studio", icon: AudioLines },
  { title: "我的知识库", href: "/knowledge", icon: BookOpen },
]

/** 「进行中」= 工作流未到终态（published/archived）的任务数 */
function countInProgress(items: AimGeneration[]): number {
  return items.filter((item) => {
    const status = normalizeAimWorkflowStatus(item.workflowStatus)
    return status !== "published" && status !== "archived"
  }).length
}

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
 * 导航条目列表（主线/工具箱共用）。
 */
function NavList({ items, pathname, searchParams, onNavigate }: {
  items: NavItem[]
  pathname: string
  searchParams: URLSearchParams
  onNavigate: () => void
}) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => {
            const active = isNavActive(pathname, searchParams, item.href)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} onClick={onNavigate} />}
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
  )
}

/**
 * 组织协同区块（Step⑤）：显性化三个组织角色与职责边界。
 * 展示层；服务端鉴权仍由路由 auth 包装器与 HITL gate 负责。
 */
function OrgNavSection() {
  const { roles, currentRoleId } = useOrg()

  return (
    <SidebarGroup className="mt-3 p-0">
      <SidebarGroupLabel className="mb-1.5 flex h-7 shrink-0 items-center gap-1 px-2.5 text-xs font-medium tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        组织协同
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="space-y-1.5 px-1.5">
          {roles.map((role) => (
            <div
              key={role.id}
              title={role.summary}
              className={
                role.id === currentRoleId
                  ? "rounded-md border border-primary/30 bg-primary/[0.06] px-2 py-1.5"
                  : "rounded-md px-2 py-1.5"
              }
            >
              <p className="flex items-center gap-1 text-xs font-medium text-foreground/85">
                {role.title}
                {role.id === currentRoleId ? (
                  <span className="rounded-sm bg-primary/15 px-1 text-[10px] text-primary">我</span>
                ) : null}
              </p>
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-muted-foreground" title={role.summary}>
                {role.owner} · {role.summary}
              </p>
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** 组织协同入口开关（Step⑤）：暂时隐藏，恢复时置回 true 即可。 */
const SHOW_ORG_NAV_SECTION = false

const TOOLBOX_OPEN_STORAGE_KEY = "aim-sidebar-toolbox-open"

/**
 * 工具箱折叠组：低频工具页默认收起，展开状态记入 localStorage。
 */
function ToolboxNavSection({ pathname, searchParams, onNavigate }: {
  pathname: string
  searchParams: URLSearchParams
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(TOOLBOX_OPEN_STORAGE_KEY) === "1")
    } catch {}
  }, [])

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(TOOLBOX_OPEN_STORAGE_KEY, next ? "1" : "0")
      } catch {}
      return next
    })
  }

  return (
    <SidebarGroup className="p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-7 w-full shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <Layers className="h-3.5 w-3.5" />
        工具箱
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <SidebarGroupContent className="mt-0.5">
          <NavList items={toolboxNav} pathname={pathname} searchParams={searchParams} onNavigate={onNavigate} />
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  )
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

  const inProgressCount = useMemo(() => countInProgress(history), [history])

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
          {inProgressCount > 0 ? (
            <span
              className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black/15 px-1 text-[10px] font-semibold tabular-nums"
              title={`${inProgressCount} 个任务进行中`}
            >
              {inProgressCount > 9 ? "9+" : inProgressCount}
            </span>
          ) : null}
        </button>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <NavList items={primaryNav} pathname={pathname} searchParams={searchParams} onNavigate={closeMobile} />
        <ToolboxNavSection pathname={pathname} searchParams={searchParams} onNavigate={closeMobile} />

        {SHOW_ORG_NAV_SECTION ? <OrgNavSection /> : null}
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
