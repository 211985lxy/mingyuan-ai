"use client"

import React from "react"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Bot,
  BookOpen,
  Database,
  FileText,
  Loader2,
  Pencil,
  RotateCw,
  Sparkles,
  Workflow,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { CollapsibleContent } from "@/components/admin/collapsible-content"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import {
  getAllAgentLogicProfiles,
  getAgentFlowEdges,
  type AgentLogicProfile,
} from "@/lib/agent-logic-profile"

// 静态逻辑数据（TS 常量，即时渲染）
const PROFILES = getAllAgentLogicProfiles()
const FLOW_EDGES = getAgentFlowEdges()

interface MethodologyItem {
  key: string
  title: string
  content: string
  source: "db" | "file"
  filePath: string
  updatedAt: string | null
  updatedBy: string | null
}

export default function AdminMethodologyPage() {
  const [methodologies, setMethodologies] = React.useState<MethodologyItem[]>([])
  const [loading, setLoading] = React.useState(true)
  // 编辑弹窗
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [editingContent, setEditingContent] = React.useState("")
  const [editingTitle, setEditingTitle] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [workflowId, setWorkflowId] = React.useState("content-growth-v1")
  const [approvalId, setApprovalId] = React.useState("")

  const fetchMethodologies = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/methodology")
      const json = await res.json()
      setMethodologies(Array.isArray(json.data) ? json.data : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "方法论加载失败，请重试")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMethodologies()
  }, [fetchMethodologies])

  function openEditor(item: MethodologyItem) {
    setEditingKey(item.key)
    setEditingTitle(item.title)
    setEditingContent(item.content)
  }

  async function handleSave() {
    if (!editingKey) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/methodology", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: editingKey,
          content: editingContent,
          workflowId,
          approvalId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "保存失败" }))
        throw new Error(err.error || "保存失败")
      }
      toast.success("方法论已保存，下次生成即时生效")
      setEditingKey(null)
      fetchMethodologies()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  async function handleReset(key: string) {
    if (!confirm("确定重置为文件原文？当前 DB 中的编辑将被清除。")) return
    try {
      const res = await fetch(`/api/admin/methodology/${key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reset", workflowId, approvalId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "重置失败" }))
        throw new Error(err.error || "重置失败")
      }
      toast.success("已重置为文件原文")
      fetchMethodologies()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败，请重试")
    }
  }

  const editingItem = methodologies.find((m) => m.key === editingKey)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="系统方法论"
        description="内置 3 份系统方法论（改完下次生成立刻生效）。徐沪生这类可点选的命名方法论在另一页。"
        actions={<>
          <Link href="/admin/methodology-profiles">
            <Button variant="outline" size="sm">命名方法论</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={fetchMethodologies}>
            <RotateCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
          <Link href="/admin/agents">
            <Button variant="outline" size="sm">
              <Activity className="mr-1.5 h-4 w-4" />
              查看真实调用追踪
            </Button>
          </Link>
        </>}
      />

      {/* 调用流程拓扑图 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="h-4 w-4 text-primary" />
            智能体调用流程
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FlowDiagram profiles={PROFILES} edges={FLOW_EDGES} />
          <p className="mt-3 text-xs text-muted-foreground">
            箭头表示智能体之间的产出可带入下一个智能体（来自各智能体的「下一步」配置）。完整调用链：商业诊断 → 选题策划 → 内容创作 / 作品编辑 → 发布质检。
          </p>
        </CardContent>
      </Card>

      {/* 智能体逻辑档案 */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Bot className="h-5 w-5 text-primary" />
          智能体逻辑档案
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PROFILES.map((profile) => (
            <AgentLogicCard key={profile.agentId} profile={profile} />
          ))}
        </div>
      </div>

      {/* 方法论库 */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-primary" />
          方法论库（可编辑整理）
        </h2>
        <Card className="mb-4">
          <CardContent className="grid gap-3 py-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="methodology-workflow-id">工作流 ID</Label>
              <Input
                id="methodology-workflow-id"
                value={workflowId}
                onChange={(event) => setWorkflowId(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="methodology-approval-id">双签中的任一 approvalId</Label>
              <Input
                id="methodology-approval-id"
                value={approvalId}
                onChange={(event) => setApprovalId(event.target.value)}
                placeholder="先在治理责任页完成两次签字"
              />
            </div>
          </CardContent>
        </Card>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {methodologies.map((item) => (
              <MethodologyCard
                key={item.key}
                item={item}
                onEdit={() => openEditor(item)}
                onReset={() => handleReset(item.key)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={editingKey !== null} onOpenChange={(open) => !open && setEditingKey(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑方法论：{editingTitle}</DialogTitle>
            <DialogDescription>
              保存后立即生效（下次智能体生成即注入新内容）。可随时重置回文件原文。
            </DialogDescription>
          </DialogHeader>
          {editingItem ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={editingItem.source === "db" ? "default" : "secondary"}>
                  {editingItem.source === "db" ? "已编辑（DB）" : "文件原文"}
                </Badge>
                <span>来源文件：{editingItem.filePath}</span>
              </div>
              <Textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="支持 Markdown 格式的方法论内容..."
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              保存并生效
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── 调用流程拓扑图 ──────────────────────────────────────

function FlowDiagram({
  profiles,
  edges,
}: {
  profiles: AgentLogicProfile[]
  edges: ReturnType<typeof getAgentFlowEdges>
}) {
  // 按调用链顺序排列节点
  const orderedIds = [
    "business_system_diagnosis",
    "business_diagnosis",
    "content_producer",
    "work_editor",
    "content_review",
  ]
  const ordered = orderedIds
    .map((id) => profiles.find((p) => p.agentId === id))
    .filter((p): p is AgentLogicProfile => Boolean(p))

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      {ordered.map((p, idx) => {
        const incoming = edges.filter((e) => e.to === p.agentId)
        const outgoing = edges.filter((e) => e.from === p.agentId)
        return (
          <React.Fragment key={p.agentId}>
            <Link
              href={`/admin/methodology/${p.agentId}`}
              className="group flex min-w-[150px] flex-1 flex-col rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{p.title}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {incoming.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">入 {incoming.length}</Badge>
                )}
                {outgoing.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">出 {outgoing.length}</Badge>
                )}
              </div>
            </Link>
            {idx < ordered.length - 1 ? (
              <div className="flex items-center self-center text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
              </div>
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── 智能体逻辑卡片 ──────────────────────────────────────

function AgentLogicCard({ profile }: { profile: AgentLogicProfile }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{profile.title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{profile.description}</p>
          </div>
          <Link href={`/admin/methodology/${profile.agentId}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        {/* 定位 */}
        <p className="text-muted-foreground">{profile.guide.intro}</p>

        {/* 调用的知识分类 */}
        <LogicSection icon={<Database className="h-3.5 w-3.5" />} title="调用的知识分类">
          <div className="flex flex-wrap gap-1">
            {profile.knowledgeCategories.length > 0 ? (
              profile.knowledgeCategories.map((c, i) => (
                <Badge key={c.key} variant="secondary" className="text-[10px]">
                  {i === 0 ? "① " : ""}
                  {c.label}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">默认优先级</span>
            )}
          </div>
        </LogicSection>

        {/* 应用的方法论 */}
        <LogicSection icon={<BookOpen className="h-3.5 w-3.5" />} title="应用的方法论">
          {profile.methodologies.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {profile.methodologies.map((m) => (
                <Badge key={m.key} variant="outline" className="text-[10px]">
                  {m.label}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">无专用方法论</span>
          )}
        </LogicSection>

        {/* 模型通道 */}
        <LogicSection icon={<Sparkles className="h-3.5 w-3.5" />} title="模型 / 通道">
          <div className="flex flex-wrap gap-1">
            {profile.modelChain.map((m, i) => (
              <Badge
                key={m.provider}
                variant={i === 0 ? "default" : "secondary"}
                className="text-[10px]"
              >
                {i === 0 ? "主：" : "备："}
                {m.label}
              </Badge>
            ))}
          </div>
        </LogicSection>

        {/* 其他知识源 */}
        {profile.otherContextSources.length > 0 ? (
          <LogicSection icon={<FileText className="h-3.5 w-3.5" />} title="其他知识源">
            <p className="text-xs text-muted-foreground">
              {profile.otherContextSources.join("、")}
            </p>
          </LogicSection>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LogicSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── 方法论卡片 ──────────────────────────────────────────

function MethodologyCard({
  item,
  onEdit,
  onReset,
}: {
  item: MethodologyItem
  onEdit: () => void
  onReset: () => void
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            {item.title}
          </CardTitle>
          <Badge variant={item.source === "db" ? "default" : "secondary"} className="text-[10px]">
            {item.source === "db" ? "已编辑" : "文件原文"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <CollapsibleContent collapsedMaxHeight={200}>
          {item.content ? (
            <MarkdownRenderer content={item.content} />
          ) : (
            <p className="text-xs text-muted-foreground">（文件未找到或为空）</p>
          )}
        </CollapsibleContent>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-[11px] text-muted-foreground">
            {item.updatedAt
              ? `更新于 ${new Date(item.updatedAt).toLocaleString("zh-CN")}`
              : "未编辑"}
          </span>
          <div className="flex gap-1">
            {item.source === "db" ? (
              <Button variant="ghost" size="sm" className="h-7" onClick={onReset}>
                重置
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="h-7" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              编辑
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
