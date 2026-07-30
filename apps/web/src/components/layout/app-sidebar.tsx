"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"
import {
  LayoutDashboard,
  Settings,
  BriefcaseBusiness,
  Target,
  FileText,
  Plus,
  MoreHorizontal,
  Trash2,
  LogIn,
  ChevronsUpDown,
  Sun,
  Moon,
  Monitor,
  Check,
  Users,
  BookOpen,
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
import { useTheme } from "@/components/providers/theme-provider"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

/** 一级导航：固定 5 项，「爆款拆解」保留高频一级入口 */
const quickNav: NavItem[] = [
  { title: "AIM 推进工作流", href: "/aim", icon: Target },
  { title: "爆款拆解", href: "/video-copy", icon: FileText },
  { title: "市场洞察", href: "/opportunities", icon: Users },
  { title: "客户项目", href: "/projects", icon: BriefcaseBusiness },
  { title: "我的知识库", href: "/knowledge", icon: BookOpen },
  { title: "工作总览", href: "/home", icon: LayoutDashboard },
]

/** AIM 专家：按工作流排序，始终展开，不提供折叠/更多入口 */
const aimExpertAgentIds: AimAgentId[] = [
  "business_system_diagnosis",
  "business_diagnosis",
  "content_producer",
  "work_editor",
  "content_retro",
]

const RECENT_THREAD_LIMIT = 50

function isNavActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const url = new URL(href, "http://local")
  const path = url.pathname
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false

  if (path === "/aim") {
    const expectedAgent = url.searchParams.get("agent")
    const actualAgent = searchParams.get("agent")
    // 「推进工作流」= 无 agent；「文案创作」等 = 精确匹配 agent
    if (expectedAgent) return actualAgent === expectedAgent
    return !actualAgent
  }

  for (const [key, value] of url.searchParams.entries()) {
    if (searchParams.get(key) !== value) return false
  }
  return true
}

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
    .replace(/[《》"“”']/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const firstClause = clean.split(/[。；;，,]/).find((part) => part.trim().length >= 4)?.trim() || clean
  if (/AI/.test(firstClause) && /提升认知|认知/.test(firstClause) && /心法|方法/.test(firstClause)) {
    return "AI提升认知三心法"
  }
  if (/Codex|AI变现工作台/.test(firstClause) && /工作台|变现/.test(firstClause)) {
    return "Codex AI变现工作台"
  }
  return firstClause.slice(0, 48)
}

function getHistoryFormatLabel(item: {
  videoScript: string | null
  rawCopy: string | null
  wechatArticle: string | null
  momentsPost: string | null
  communityMessage: string | null
}) {
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
  const theme = compactHistoryTheme(item.topicTitle || extractHistoryTheme(item.rawInput))
  const format = getHistoryFormatLabel(item)
  return format ? `${format}｜${theme}` : theme
}

/** 底部账户：一行摘要，设置与切换收进菜单 */
function SidebarAccountMenu({
  active,
  onNavigate,
}: {
  active: boolean
  onNavigate: () => void
}) {
  const router = useRouter()
  const { colorMode, setColorMode } = useTheme()
  const user = useAuthStore((s) => s.user)
  const email = user?.email?.trim() || "账户"
  const initial = email.slice(0, 1).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors",
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground/75 hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate">{email}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-45" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuItem
          onClick={() => {
            setColorMode("light")
          }}
        >
          <Sun className="h-4 w-4" />
          <span className="flex-1">白天模式</span>
          {colorMode === "light" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setColorMode("dark")
          }}
        >
          <Moon className="h-4 w-4" />
          <span className="flex-1">夜晚模式</span>
          {colorMode === "dark" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setColorMode("system")
          }}
        >
          <Monitor className="h-4 w-4" />
          <span className="flex-1">跟随系统</span>
          {colorMode === "system" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate()
            router.push("/account")
          }}
        >
          <Settings className="h-4 w-4" />
          账户设置
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate()
            router.push("/login?switch=1")
          }}
        >
          <LogIn className="h-4 w-4" />
          切换账号
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Codex 风格侧栏：新建任务 CTA + 扁平线程列表 + 安静的选中态。
 */
export function AppSidebar() {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const router = useRouter()
  const branding = useBranding()
  const { setOpenMobile } = useSidebar()

  const isAim = pathname === "/aim"
  const agentParam = searchParams.get("agent")
  const historyAgentId = isValidAimAgent(agentParam) ? agentParam : DEFAULT_AIM_AGENT
  const historyAgent = getAimAgent(historyAgentId)

  const history = useAimWorkspaceStore((s) => s.history)
  const fetchHistory = useAimWorkspaceStore((s) => s.fetchHistory)
  const deleteHistory = useAimWorkspaceStore((s) => s.deleteHistory)
  const requestLoad = useAimWorkspaceStore((s) => s.requestLoad)
  const requestNewCopy = useAimWorkspaceStore((s) => s.requestNewCopy)

  // 「最近任务」按当前 AIM 专家划分；切换智能体时强制刷新
  useEffect(() => {
    fetchHistory({ agentId: historyAgentId, force: true }).catch(() => {})
  }, [fetchHistory, historyAgentId])

  const closeMobile = () => setOpenMobile(false)

  async function handleDeleteHistory(id: string, title: string) {
    if (!window.confirm(`删除这条任务？\n${title}`)) return
    try {
      await deleteHistory(id)
      toast.success("已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败")
    }
  }

  const recentThreads = useMemo(() => {
    const ranked = [...history]
      .filter((item) => {
        const itemAgent = item.agentId === "ip_video"
          ? "content_producer"
          : item.agentId === "deep_copywriter"
            ? "work_editor"
            : item.agentId
        // 无 agentId 的旧记录不跨专家串台展示
        return Boolean(itemAgent) && itemAgent === historyAgentId
      })
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt).getTime()
        const bTime = new Date(b.updatedAt || b.createdAt).getTime()
        return bTime - aTime
      })
    return ranked.slice(0, RECENT_THREAD_LIMIT)
  }, [history, historyAgentId])

  return (
    <Sidebar className="border-r border-border/40 bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="gap-2 px-3 pb-2 pt-3">
        <Link
          href="/home"
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
          新建文案
        </button>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 pb-2">
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

        <SidebarGroup className="mt-3 p-0">
          <SidebarGroupLabel className="mb-1.5 h-7 px-2.5 text-xs font-medium tracking-wide text-muted-foreground">
            AIM 专家
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {aimExpertAgentIds.map((agentId) => {
                const agent = getAimAgent(agentId)
                const Icon = agent.icon
                const active = isAim && agentParam === agent.id
                return (
                  <SidebarMenuItem key={agent.id}>
                    <SidebarMenuButton
                      render={<Link href={`/aim?agent=${agent.id}`} onClick={closeMobile} />}
                      isActive={active}
                      className={cn(
                        "h-10 w-full rounded-md px-2.5 text-sm font-normal md:h-9",
                        active
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground/75 hover:bg-secondary/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 opacity-70" />
                      <span className="truncate">{agent.displayTitle ?? agent.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-3 flex min-h-0 flex-1 flex-col p-0">
          <SidebarGroupLabel className="mb-1.5 h-7 shrink-0 px-2.5 text-xs font-medium tracking-wide text-muted-foreground">
            最近任务 · {historyAgent.displayTitle ?? historyAgent.title}
          </SidebarGroupLabel>
          <SidebarGroupContent className="min-h-0 flex-1 basis-40 overflow-y-auto">
            <div className="space-y-0.5 pb-1">
              {recentThreads.length === 0 ? (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  暂无「{historyAgent.displayTitle ?? historyAgent.title}」任务
                </p>
              ) : (
                recentThreads.map((item) => {
                  const title = formatHistoryTitle(item)
                  const date = formatHistoryDate(item.createdAt)
                  return (
                    <div
                      key={item.id}
                      className="group/item relative flex items-start rounded-md text-sm text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          // 缺 agentId 时留在当前专家，避免误跳内容创作后列表被清空导致打不开
                          const agentId = isValidAimAgent(item.agentId) ? item.agentId : historyAgentId
                          requestLoad(item.id)
                          if (!isAim || agentParam !== agentId) {
                            router.push(`/aim?agent=${agentId}`)
                          }
                          closeMobile()
                        }}
                        className="min-w-0 flex-1 px-2.5 py-1.5 pr-8 text-left"
                        title={title}
                      >
                        <span className="line-clamp-2 break-words leading-snug">{title}</span>
                        {date ? (
                          <span className="mt-0.5 block text-[11px] leading-none text-muted-foreground">
                            {date}
                          </span>
                        ) : null}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="absolute right-1 top-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm opacity-0 hover:bg-foreground/[0.06] group-hover/item:opacity-100"
                          aria-label="更多操作"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
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
                })
              )}
            </div>
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
