"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Plus, Power } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AgentKeyItem {
  id: string
  name: string
  keyPrefix: string
  status: string
  allowedProjectCount: number
  allowedAgents: string[]
  clientType: string | null
  allowedScopes: string[]
  dailyLimit: number
  minuteLimit: number
  dailyTokenLimit: number | null
  maxInputChars: number
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

interface CreateResult {
  id: string
  name: string
  apiKey: string
  keyPrefix: string
  clientType: string
  scopes: string[]
  warning: string
}

const CLIENT_TYPE_LABEL: Record<string, string> = {
  codex: "Codex",
  workbuddy: "WorkBuddy",
  custom: "自定义",
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "从未"
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

/**
 * @description agentkeyspanel — 管理 maim_ Key（创建/停用/撤销）
 * @returns 无返回值
 */
export function AgentKeysPanel() {
  const [keys, setKeys] = useState<AgentKeyItem[]>([])
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreateResult | null>(null)
  const [revealed, setRevealed] = useState(false)

  // Create form state
  const [name, setName] = useState("")
  const [clientType, setClientType] = useState<"codex" | "workbuddy" | "custom">("codex")
  const [projectIds, setProjectIds] = useState("")
  const [dailyLimit, setDailyLimit] = useState(20)

  async function reload() {
    setBusy(true)
    try {
      const res = await fetch("/api/account/agent-keys")
      if (!res.ok) throw new Error("请求失败")
      const json = await res.json()
      setKeys(json.items)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void reload() }, [])

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("已复制")
    } catch {
      toast.error("复制失败，请手动选择复制")
    }
  }

  async function createKey() {
    const projects = projectIds.split(",").map((s) => s.trim()).filter(Boolean)
    if (!name.trim() || projects.length === 0) {
      toast.error("请填写名称和至少一个项目 ID")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/account/agent-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          clientType,
          projects,
          dailyLimit,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "创建失败")
      }
      const result: CreateResult = await res.json()
      setCreatedKey(result)
      setRevealed(true)
      setShowCreate(false)
      setName("")
      setProjectIds("")
      await reload()
      toast.success("Key 已创建，请立即复制保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败")
    } finally {
      setBusy(false)
    }
  }

  async function disableKey(id: string, action: "disable" | "revoke") {
    setBusy(true)
    try {
      const res = await fetch(`/api/account/agent-keys/${id}?action=${action}`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "操作失败")
      }
      toast.success(action === "revoke" ? "已立即撤销" : "已停用")
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              API Key 管理
            </CardTitle>
            <CardDescription>创建和管理 Codex / WorkBuddy 专用 Key。明文 Key 仅创建时显示一次。</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCreate((v) => !v)} disabled={busy}>
            <Plus className="h-4 w-4" />
            新建 Key
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {createdKey && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">⚠️ {createdKey.warning}</p>
              <Button size="sm" variant="ghost" onClick={() => setCreatedKey(null)}>关闭</Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-sm font-mono">
                {revealed ? createdKey.apiKey : "•".repeat(Math.min(createdKey.apiKey.length, 48))}
              </code>
              <Button size="sm" variant="outline" onClick={() => setRevealed((v) => !v)}>
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copyText(createdKey.apiKey)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">名称</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="codex-prod" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">客户端类型</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={clientType}
                  onChange={(e) => setClientType(e.target.value as "codex" | "workbuddy" | "custom")}
                >
                  <option value="codex">Codex（草稿生成 + 轮询）</option>
                  <option value="workbuddy">WorkBuddy（灵感 + 回复）</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">项目 ID（逗号分隔）</Label>
                <Input value={projectIds} onChange={(e) => setProjectIds(e.target.value)} placeholder="proj_a,proj_b" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">每日调用上限</Label>
                <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(parseInt(e.target.value, 10) || 20)} min={1} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
              <Button size="sm" onClick={() => void createKey()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                创建
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">暂无 API Key</p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{key.name}</span>
                    {key.clientType && (
                      <Badge variant="secondary" className="text-xs">{CLIENT_TYPE_LABEL[key.clientType] ?? key.clientType}</Badge>
                    )}
                    <Badge variant={key.status === "active" ? "default" : "outline"} className="text-xs">
                      {key.status === "active" ? "启用" : "已停用"}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{key.keyPrefix}…</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>项目 {key.allowedProjectCount} 个</span>
                  <span>每日 {key.dailyLimit} 次 / 分钟 {key.minuteLimit} 次</span>
                  {key.dailyTokenLimit && <span>Token 上限 {key.dailyTokenLimit}</span>}
                  <span>输入上限 {key.maxInputChars} 字</span>
                  {key.allowedScopes.length > 0 && <span>Scopes {key.allowedScopes.length} 项</span>}
                  {key.expiresAt && <span>过期 {new Date(key.expiresAt).toLocaleDateString()}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">最后使用：{formatRelativeTime(key.lastUsedAt)}</span>
                  {key.status === "active" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void disableKey(key.id, "disable")} disabled={busy}>
                        <Power className="h-3.5 w-3.5" />
                        停用
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => void disableKey(key.id, "revoke")} disabled={busy}>
                        立即撤销
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
