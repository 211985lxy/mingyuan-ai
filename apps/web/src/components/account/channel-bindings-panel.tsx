"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Copy, Link2, Loader2, Power, PowerOff, Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { deleteChannelBinding, listChannelBindings, saveChannelBinding, testChannelBinding, updateChannelBinding, type ChannelBindingItem } from "@/lib/api/inspiration"
import { listClientProjects, type ClientProject } from "@/lib/api/projects"

const PLATFORM_LABELS: Record<ChannelBindingItem["platform"], string> = {
  feishu: "飞书群",
  workbuddy_wechat: "WorkBuddy 微信群",
  wecom: "企业微信",
}

const EXECUTION_MODE_LABELS: Record<ChannelBindingItem["executionMode"], string> = {
  capture_only: "仅记录",
  evaluate: "评估模式",
  live: "正式运行",
}

const EXECUTION_MODE_DESCRIPTIONS: Record<ChannelBindingItem["executionMode"], string> = {
  capture_only: "只记录和提取，不生成选题，不回复",
  evaluate: "生成候选选题，不写入选题库，不回复",
  live: "完整流程：提取、生成、入库、回复",
}

const HEALTH_LABELS: Record<ChannelBindingItem["healthStatus"], { label: string; className: string }> = {
  healthy: { label: "正常", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  degraded: { label: "异常", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  unknown: { label: "未知", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "暂无"
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

/**
 * @description channelbindingspanel
 * @returns 无返回值
 */
export function ChannelBindingsPanel() {
  const [items, setItems] = useState<ChannelBindingItem[]>([])
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [platform, setPlatform] = useState<ChannelBindingItem["platform"]>("feishu")
  const [projectId, setProjectId] = useState("")
  const [externalChatId, setExternalChatId] = useState("")
  const [keywords, setKeywords] = useState("收选题")
  const [executionMode, setExecutionMode] = useState<ChannelBindingItem["executionMode"]>("live")
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [bindings, projectItems] = await Promise.all([listChannelBindings(), listClientProjects()])
    setItems(bindings)
    setProjects(projectItems)
    setProjectId((current) => current || projectItems[0]?.id || "")
  }

  useEffect(() => { void reload().catch((error) => toast.error(error instanceof Error ? error.message : "群聊绑定读取失败")) }, [])

  async function submit() {
    if (!projectId || !externalChatId.trim()) return toast.error("请选择项目并填写群 ID")
    setBusy(true)
    try {
      await saveChannelBinding({
        platform,
        projectId,
        externalChatId: externalChatId.trim(),
        triggerMode: "mention_or_keyword",
        triggerKeywords: keywords.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
        executionMode,
      })
      setExternalChatId("")
      await reload()
      toast.success("群聊绑定已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "群聊绑定保存失败")
    } finally {
      setBusy(false)
    }
  }

  async function toggle(item: ChannelBindingItem) {
    await updateChannelBinding(item.id, { status: item.status === "active" ? "disabled" : "active" })
    await reload()
  }

  async function test(item: ChannelBindingItem) {
    const result = await testChannelBinding(item.id)
    if (result.ok) toast.success("配置检查通过")
    else toast.error("配置未就绪")
    if (result.note) toast.info(result.note)
  }

  async function remove(item: ChannelBindingItem) {
    await deleteChannelBinding(item.id)
    await reload()
    toast.success("群聊绑定已删除")
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const workBuddySkillUrl = origin ? `${origin}/skill-workbuddy-wechat.md` : "/skill-workbuddy-wechat.md"

  return <Card>
    <CardHeader>
      <CardTitle>群聊选题采集</CardTitle>
      <CardDescription>绑定群 ID 与 AIM 项目</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5"><Label>平台</Label><Select value={platform} onValueChange={(value) => setPlatform((value || "feishu") as ChannelBindingItem["platform"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PLATFORM_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>项目</Label><Select value={projectId} onValueChange={(value) => setProjectId(value || "")}><SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>外部群 ID</Label><Input value={externalChatId} onChange={(event) => setExternalChatId(event.target.value)} placeholder="chat_id" /></div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-1.5"><Label>触发关键词</Label><Input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="收选题" /></div>
        <div className="w-full space-y-1.5 md:w-48">
          <Label>运行模式</Label>
          <Select value={executionMode} onValueChange={(value) => setExecutionMode((value || "live") as ChannelBindingItem["executionMode"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EXECUTION_MODE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  <div className="flex flex-col">
                    <span>{label}</span>
                    <span className="text-xs text-muted-foreground">{EXECUTION_MODE_DESCRIPTIONS[value as ChannelBindingItem["executionMode"]]}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}绑定</Button>
      </div>

      {items.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{PLATFORM_LABELS[item.platform]}</span>
            <Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status === "active" ? "启用" : "停用"}</Badge>
            <Badge variant="outline" className="text-xs">{EXECUTION_MODE_LABELS[item.executionMode]}</Badge>
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${HEALTH_LABELS[item.healthStatus].className}`}>
              {item.healthStatus === "degraded" && <AlertTriangle className="mr-0.5 h-3 w-3" />}
              {HEALTH_LABELS[item.healthStatus].label}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.project.name} · {item.externalChatId}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>最近收消息: {formatRelativeTime(item.lastReceivedAt)}</span>
            <span>24h 收 {item.receivedCount24h} · 回复 {item.sentCount24h}</span>
            {item.deadLetterCount24h > 0 && <span className="text-destructive">死信 {item.deadLetterCount24h}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" title="复制群 ID" onClick={() => void navigator.clipboard.writeText(item.externalChatId)}><Copy className="h-4 w-4" /></Button>
          <Button size="icon-sm" variant="ghost" title="测试配置" onClick={() => void test(item)}><CheckCircle2 className="h-4 w-4" /></Button>
          <Button size="icon-sm" variant="ghost" title={item.status === "active" ? "停用" : "启用"} onClick={() => void toggle(item)}>{item.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}</Button>
          <Button size="icon-sm" variant="ghost" title="删除" onClick={() => void remove(item)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>)}

      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <p className="truncate text-sm text-muted-foreground">WorkBuddy Skill: {workBuddySkillUrl}</p>
        <Button size="icon-sm" variant="ghost" title="复制 Skill 地址" onClick={() => void navigator.clipboard.writeText(workBuddySkillUrl)}><Copy className="h-4 w-4" /></Button>
      </div>
    </CardContent>
  </Card>
}
