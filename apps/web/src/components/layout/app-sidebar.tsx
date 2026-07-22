"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"
import {
  LayoutDashboard,
  Settings,
  BriefcaseBusiness,
  BarChart2,
  Bell,
  FileCheck,
  Target,
  Search,
  Bookmark,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  LogIn,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  DEFAULT_AIM_AGENT,
  getAimAgent,
  isValidAimAgent,
  type AimAgentId,
} from "@/lib/aim-ui-config"
import { useAimWorkspaceStore } from "@/lib/aim-workspace-store"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "今日工作",
    items: [
      { title: "工作总览", href: "/home", icon: LayoutDashboard },
      { title: "待审核内容", href: "/home?tab=review", icon: FileCheck },
    ],
  },
  {
    label: "客户全案",
    items: [
      { title: "客户项目", href: "/projects", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "内容机会",
    items: [
      { title: "主动搜索", href: "/opportunities", icon: Search },
      { title: "今日机会", href: "/opportunities?tab=daily", icon: Bell },
      { title: "对标账号", href: "/opportunities?tab=benchmarks", icon: BarChart2 },
      { title: "已收藏研究", href: "/opportunities?tab=collections", icon: Bookmark },
    ],
  },
  {
    label: "AIM 创作",
    items: [
      { title: "推进工作流", href: "/aim", icon: Target },
    ],
  },
]

const footerItems: NavItem[] = [
  { title: "账户设置", href: "/account", icon: Settings },
  { title: "切换账号", href: "/login?switch=1", icon: LogIn },
]

const coreAimAgentIds: AimAgentId[] = [
  "business_system_diagnosis",
  "business_diagnosis",
  "content_producer",
  "deep_copywriter",
  "content_review",
  "persona",
]

const RECENT_ITEMS_PER_AGENT = 4

function formatHistoryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(5, 10)
}

function extractHistoryTheme(input: string) {
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean)
  const lastUserLine = [...lines].reverse().find((line) => line.startsWith("用户："))
  if (lastUserLine) return compactHistoryTheme(lastUserLine.replace(/^用户：\s*/, ""))
  const labeled = lines.find((line) => /^(对标标题|选题|主题|标题)[:：]/.test(line))
  if (labeled) return compactHistoryTheme(labeled.replace(/^(对标标题|选题|主题|标题)[:：]\s*/, ""))

  const content = lines
    .filter((line) => !/^请基于|^创作原则|^改写原则|^\d+[.、]/.test(line))
    .find((line) => line.length > 8)
  return compactHistoryTheme(content || input)
}

function compactHistoryTheme(text: string) {
  const clean = text
    .replace(/#\S+/g, "")
    .replace(/[《》"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const firstClause = clean.split(/[。；;，,]/).find((part) => part.trim().length >= 4)?.trim() || clean
  if (/AI/.test(firstClause) && /提升认知|认知/.test(firstClause) && /心法|方法/.test(firstClause)) {
    return "AI提升认知三心法"
  }
  if (/Codex|AI变现工作台/.test(firstClause) && /工作台|变现/.test(firstClause)) {
    return "Codex AI变现工作台"
  }
  return firstClause.slice(0, 18)
}

function getHistoryFormatLabel(item: { videoScript: string | null; rawCopy: string | null; wechatArticle: string | null; momentsPost: string | null; communityMessage: string | null }) {
  if (item.videoScript) return "口播"
  if (item.wechatArticle) return "公众号"
  if (item.momentsPost) return "朋友圈"
  if (item.communityMessage) return "社群"
  if (item.rawCopy) return "文案"
  return ""
}

function formatHistoryTitle(item: {
  topicTitle?: string | null
  rawInput: string
  createdAt: string
  videoScript: string | null
  rawCopy: string | null
  wechatArticle: string | null
  momentsPost: string | null
  communityMessage: string | null
}) {
  const date = formatHistoryDate(item.createdAt)
  const theme = compactHistoryTheme(item.topicTitle || extractHistoryTheme(item.rawInput))
  const format = getHistoryFormatLabel(item)
  return [`${format ? `${format}｜` : ""}${theme}`, date].filter(Boolean).join(" ")
}

/** 侧边栏左下角账号徽标：邮箱 + 到期时间 */
function SidebarAccountBadge() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  const status = getSubscriptionStatus(user.expiresAt ?? null)
  const expiryLabel =
    status === "inactive" ? "未激活"
    : status === "expired" ? "已过期"
    : !user.expiresAt ? "未设置"
    : new Date(user.expiresAt).toLocaleDateString("zh-CN")

  return (
    <div className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground">
      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground/80">{user.email}</p>
        <p>到期 {expiryLabel}</p>
      </div>
    </div>
  )
}

/**
 * @description appsidebar
 * @returns 无返回值
 */
export function AppSidebar() {
  const [collapsedAgents, setCollapsedAgents] = useState<Set<AimAgentId>>(new Set())
  const [showAllAgents, setShowAllAgents] = useState<Set<AimAgentId>>(new Set())
  const [advancedModeOpen, setAdvancedModeOpen] = useState(false)
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const branding = useBranding()
  const { setOpenMobile } = useSidebar()

  const isAim = pathname === "/aim"
  const agentParam = searchParams.get("agent")
  const activeAgent: AimAgentId = isValidAimAgent(agentParam) ? agentParam : DEFAULT_AIM_AGENT

  const history = useAimWorkspaceStore((s) => s.history)
  const fetchHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const deleteHistory = useAimWorkspaceStore((s) => s.deleteHistory)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)

  // 进入 /aim 时拉取当前智能体最近生成记录
  useEffect(() => {
    if (isAim) fetchHistory({ agentId: activeAgent }).catch(() => {})
  }, [activeAgent, isAim, fetchHistory])

  const closeMobile = () => setOpenMobile(false)

  async function handleDeleteHistory(id: string, title: string) {
    if (!window.confirm(`删除这条内容？\n${title}`)) return
    try {
      await deleteHistory(id)
      toast.success("已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败")
    }
  }

  const historyGroups = coreAimAgentIds
    .map((agentId) => {
      const agent = getAimAgent(agentId)
      const items = history.filter((item) => {
        const itemAgentId = isValidAimAgent(item.agentId) ? item.agentId : DEFAULT_AIM_AGENT
        return itemAgentId === agentId
      })
      return { agent, items }
    })

  return (
    <Sidebar className="border-r border-border/40 bg-sidebar/95 backdrop-blur-md">
      <SidebarHeader className="p-4 border-b border-border/20">
        <Link href="/home" className="flex items-center gap-3 cursor-pointer group">
          <BrandLogo className="h-8 w-8 rounded-md transition-transform duration-500 group-hover:rotate-180" />
          <span className="text-lg font-bold tracking-wider bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
            {branding.name}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-4">
        {/* 导航分组 */}
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-3 text-sm font-semibold tracking-wide text-foreground/80">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent className="mt-1">
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        className={cn(
                          "cursor-pointer w-full transition-all duration-200 rounded-md py-2.5 px-3 flex items-center gap-3",
                          active
                            ? "bg-primary/8 text-primary font-semibold border-l-[3px] border-l-primary rounded-l-none pl-2.5"
                            : "hover:bg-secondary/40 text-foreground/80 hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm tracking-wide">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* 默认引导用户推进工作流；专家入口仅在主动展开后显示。 */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-sm font-semibold tracking-wide text-foreground/80">
            AIM 工作流
          </SidebarGroupLabel>
            <SidebarGroupContent className="mt-1">
              <div className="space-y-3 px-1.5">
                <Link
                  href="/aim"
                  onClick={closeMobile}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition-colors",
                    isAim && !agentParam ? "bg-primary/10 text-primary" : "bg-muted/60 text-foreground hover:bg-muted",
                  )}
                >
                  <Target className="h-4 w-4" />
                  推进内容工作流
                </Link>
                <button
                  type="button"
                  onClick={() => setAdvancedModeOpen((open) => !open)}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  aria-expanded={advancedModeOpen}
                >
                  高级模式
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", advancedModeOpen && "rotate-90")} />
                </button>
                {advancedModeOpen && historyGroups.map(({ agent, items }) => {
                  const Icon = agent.icon
                  const active = isAim && agent.id === activeAgent
                  const collapsed = collapsedAgents.has(agent.id)
                  const showAll = showAllAgents.has(agent.id)
                  const visibleItems = showAll ? items : items.slice(0, RECENT_ITEMS_PER_AGENT)
                  return (
                    <div key={agent.id} className="space-y-0.5">
                      <div
                        className={cn(
                          "flex h-8 w-full items-center rounded-md text-sm font-semibold transition-colors",
                          active ? "bg-muted/70 text-foreground" : "text-foreground/85 hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <button
                          type="button"
                          aria-label={collapsed ? "展开历史" : "折叠历史"}
                          disabled={!isAim || items.length === 0}
                          onClick={() => {
                            setCollapsedAgents((current) => {
                              const next = new Set(current)
                              if (next.has(agent.id)) next.delete(agent.id)
                              else next.add(agent.id)
                              return next
                            })
                          }}
                          className="flex h-8 w-6 shrink-0 items-center justify-center rounded-l-md text-muted-foreground disabled:opacity-0"
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
                        </button>
                        <Link
                          href={`/aim?agent=${agent.id}`}
                          onClick={closeMobile}
                          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-r-md pr-1.5"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{agent.displayTitle ?? agent.title}</span>
                        </Link>
                      </div>

                      {isAim && items.length > 0 && !collapsed && (
                        <div className="space-y-0.5 pl-8">
                          {visibleItems.map((item) => {
                            const title = formatHistoryTitle(item)
                            return (
                              <div
                                key={item.id}
                                className="group/item flex h-8 items-center rounded-md text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    requestLoad(item.id)
                                    closeMobile()
                                  }}
                                  className="min-w-0 flex-1 px-1.5 text-left"
                                  title={title}
                                >
                                  <span className="block truncate">{title}</span>
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm opacity-0 hover:bg-muted group-hover/item:opacity-100"
                                    aria-label="更多操作"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-28">
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => void handleDeleteHistory(item.id, title)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )
                          })}

                          {items.length > RECENT_ITEMS_PER_AGENT && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowAllAgents((current) => {
                                  const next = new Set(current)
                                  if (next.has(agent.id)) next.delete(agent.id)
                                  else next.add(agent.id)
                                  return next
                                })
                              }}
                              className="block h-8 w-full rounded-md px-1.5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            >
                              {showAll ? "收起显示" : "展开显示"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/20">
        <SidebarAccountBadge />
        <SidebarMenu>
          {footerItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={active}
                  className={cn(
                    "cursor-pointer w-full transition-all duration-200 rounded-md py-2 px-3 flex items-center gap-3",
                    active
                      ? "bg-primary/8 text-primary font-semibold"
                      : "hover:bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="text-sm tracking-wide">{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
        <p className="text-[10px] tracking-widest text-muted-foreground/60 text-center font-mono uppercase mt-2">
          {branding.name} v1.0
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
