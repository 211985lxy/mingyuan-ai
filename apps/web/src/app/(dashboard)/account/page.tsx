"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, CalendarDays, Copy, KeyRound, Link2, LogIn, LogOut, Video } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/lib/store"
import { getCurrentUser, listAgentApiKeys, logoutUser } from "@/lib/api/client"
import { getSubscriptionStatus } from "@/lib/subscription"
import type { ApiAgentApiKeySummary, ApiUser } from "@/types/api"
import { ChannelBindingsPanel } from "@/components/account/channel-bindings-panel"
import { InspirationFailuresPanel } from "@/components/account/inspiration-failures-panel"
import { AgentKeysPanel } from "@/components/account/agent-keys-panel"

/* ── Page ────────────────────────────────────────────────── */

export default function AccountPage() {
  const router = useRouter()
  const { user, clearSession } = useAuthStore()
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null)
  const [agentKeys, setAgentKeys] = useState<ApiAgentApiKeySummary[]>([])

  useEffect(() => {
    getCurrentUser().then(setCurrentUser)
    listAgentApiKeys().then(setAgentKeys).catch(() => setAgentKeys([]))
  }, [])

  const displayEmail = user?.email ?? currentUser?.email ?? ""
  const displayCreatedAt = user?.createdAt ?? currentUser?.createdAt
  const expiresAt = user?.expiresAt
  const subscriptionStatus = getSubscriptionStatus(expiresAt ?? null)

  async function endSession(destination: string) {
    try {
      await logoutUser()
    } finally {
      clearSession()
      router.push(destination)
    }
  }

  function handleSwitchAccount() {
    void endSession("/login?switch=1")
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  }

  function formatExpiryLabel() {
    if (subscriptionStatus === "inactive") return "未激活"
    if (subscriptionStatus === "expired") {
      return expiresAt ? `已过期（${formatDate(expiresAt)}）` : "已过期"
    }
    if (expiresAt) return formatDate(expiresAt)
    return "—"
  }

  function copyText(text: string) {
    void navigator.clipboard.writeText(text)
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const skillUrl = origin ? `${origin}/skill.md` : "/skill.md"
  const wechatSkillUrl = origin ? `${origin}/skill-wechat-chat.md` : "/skill-wechat-chat.md"
  const mcpUrl = origin ? `${origin}/api/aim-mcp/mcp` : "/api/aim-mcp/mcp"
  const activeAgentKeys = agentKeys.filter((key) => key.status === "active")

  return (
    <div className="space-y-8">
      <PageHeader title="账户设置" />

      {/* Section 1 — 账号信息 */}
      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between min-w-0">
            <div className="text-sm min-w-0">
              <span className="text-muted-foreground">邮箱: </span>
              <span className="font-medium break-all">{displayEmail}</span>
            </div>
          </div>
          {displayCreatedAt && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">注册时间: </span>
                  <span className="font-medium">
                    {formatDate(displayCreatedAt)}
                  </span>
                </div>
              </div>
            </>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">服务到期时间: </span>
              <span className="font-medium">{formatExpiryLabel()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — 外部 Agent */}
      <Card>
        <CardHeader>
          <CardTitle>外部 Agent 绑定</CardTitle>
          <CardDescription>给 Codex / Claude Code 等外部 Agent 调用 AIM 智能体生成草稿</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Skill 地址</p>
                <p className="mt-1 break-all text-sm text-muted-foreground">{skillUrl}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => copyText(skillUrl)}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              复制
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">微信聊天 Skill 地址</p>
                <p className="mt-1 break-all text-sm text-muted-foreground">{wechatSkillUrl}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => copyText(wechatSkillUrl)}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              复制
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">MCP 接入地址（Codex）</p>
                <p className="mt-1 break-all text-sm text-muted-foreground">{mcpUrl}</p>
                <p className="mt-1 text-xs text-muted-foreground">Streamable HTTP，Bearer Token 使用下方 maim_ Key。当前由管理员发放专用 Codex Key 后开通。</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => copyText(mcpUrl)}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              复制
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">绑定状态</p>
              <p className="mt-1 text-sm font-medium">{activeAgentKeys.length > 0 ? "已开通" : "未开通"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">可用 Key</p>
              <p className="mt-1 text-sm font-medium">{activeAgentKeys.length} 个</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">生成权限</p>
              <p className="mt-1 text-sm font-medium">只生成草稿</p>
            </div>
          </div>

          {agentKeys.length > 0 ? (
            <div className="space-y-2">
              {agentKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{key.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {key.keyPrefix}... · 项目 {key.allowedProjectCount} 个 · 每日 {key.dailyLimit} 次
                      </p>
                    </div>
                  </div>
                  <Badge variant={key.status === "active" ? "default" : "secondary"}>
                    {key.status === "active" ? "启用" : "停用"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              暂未绑定。请联系管理员生成低额度 API Key 后，再把 Skill 地址交给外部 Agent 使用。
            </p>
          )}
        </CardContent>
      </Card>

      <ChannelBindingsPanel />

      <AgentKeysPanel />

      <InspirationFailuresPanel />

      {/* Section 3 — 外部账号 */}
      <Card>
        <CardHeader>
          <CardTitle>外部账号绑定</CardTitle>
          <CardDescription>账号绑定功能即将上线</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Video className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">视频号</span>
            </div>
            <Badge variant="secondary" className="text-muted-foreground">
              Coming Soon
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">小红书</span>
            </div>
            <Badge variant="secondary" className="text-muted-foreground">
              Coming Soon
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Section 4 — 登录状态 */}
      <Card>
        <CardHeader>
          <CardTitle>登录状态</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleSwitchAccount}
            className="cursor-pointer"
          >
            <LogIn className="h-4 w-4 mr-2" />
            切换账号登录
          </Button>
          <Button
            variant="destructive"
            onClick={() => void endSession("/login")}
            className="cursor-pointer"
          >
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
