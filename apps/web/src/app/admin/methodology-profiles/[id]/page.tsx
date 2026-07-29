"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

interface VersionRow {
  id: string
  version: number
  status: string
  checksum: string
  compiledPrompt: string
  contentMarkdown: string
  createdAt: string
  publishedAt: string | null
}

interface ProfileDetail {
  id: string
  name: string
  slug: string
  originatorName: string | null
  aliases: string[]
  description: string | null
  scope: string
  status: string
  methodologyType: string
  applicableAgents: string[]
  applicableTasks: string[]
  priority: number
  updatedAt: string
  versions: VersionRow[]
}

export default function AdminMethodologyProfileDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [detail, setDetail] = React.useState<ProfileDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [savingMeta, setSavingMeta] = React.useState(false)
  const [savingVersion, setSavingVersion] = React.useState(false)

  const [name, setName] = React.useState("")
  const [originatorName, setOriginatorName] = React.useState("")
  const [aliasesText, setAliasesText] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [agentsText, setAgentsText] = React.useState("")
  const [status, setStatus] = React.useState<"active" | "archived">("active")
  const [compiledPrompt, setCompiledPrompt] = React.useState("")
  const [workflowId, setWorkflowId] = React.useState("content-growth-v1")
  const [approvalId, setApprovalId] = React.useState("")

  const load = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/methodology-profiles/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "加载失败")
      const data = json.data as ProfileDetail
      setDetail(data)
      setName(data.name)
      setOriginatorName(data.originatorName ?? "")
      setAliasesText(data.aliases.join("、"))
      setDescription(data.description ?? "")
      setAgentsText(data.applicableAgents.join("、"))
      setStatus(data.status === "archived" ? "archived" : "active")
      const latest = data.versions[0]
      setCompiledPrompt(latest?.compiledPrompt ?? "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败")
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function saveMeta() {
    if (!id) return
    setSavingMeta(true)
    try {
      const res = await fetch(`/api/admin/methodology-profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          originatorName: originatorName || null,
          aliases: aliasesText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          description: description || null,
          applicableAgents: agentsText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          status,
          workflowId,
          approvalId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "保存失败")
      toast.success("基础信息已保存")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSavingMeta(false)
    }
  }

  async function createVersion(as: "draft" | "published") {
    if (!id) return
    setSavingVersion(true)
    try {
      const res = await fetch(`/api/admin/methodology-profiles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compiledPrompt,
          status: as,
          workflowId,
          approvalId: as === "published" ? approvalId : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "保存失败")
      toast.success(as === "published" ? `已发布 v${json.data.version}` : `已存草稿 v${json.data.version}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSavingVersion(false)
    }
  }

  async function publishVersion(versionId: string) {
    if (!id) return
    setSavingVersion(true)
    try {
      const res = await fetch(`/api/admin/methodology-profiles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish_version",
          versionId,
          workflowId,
          approvalId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "发布失败")
      toast.success(`已发布 v${json.data.version}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发布失败")
    } finally {
      setSavingVersion(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载中…
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">方法论不存在或加载失败。</p>
        <Link href="/admin/methodology-profiles">
          <Button variant="outline">返回列表</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={detail.name}
        description={`slug: ${detail.slug} · 改规则请发新版本，不要指望原地覆盖。`}
        actions={
          <Link href="/admin/methodology-profiles">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-4" />
              返回列表
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">正式变更审批</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="governance-workflow-id">工作流 ID</Label>
            <Input
              id="governance-workflow-id"
              value={workflowId}
              onChange={(event) => setWorkflowId(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="governance-approval-id">双签中的任一 approvalId</Label>
            <Input
              id="governance-approval-id"
              value={approvalId}
              onChange={(event) => setApprovalId(event.target.value)}
              placeholder="先在治理责任页完成两次签字"
            />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            元信息、发布新版本和发布草稿均需当前业务 Owner 与系统 Owner 双签；草稿保存不进入运行时。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基础信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">名称</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="originator">来源作者</Label>
            <Input id="originator" value={originatorName} onChange={(e) => setOriginatorName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="aliases">别名（用顿号或逗号分隔，用户说这些词就能命中）</Label>
            <Input id="aliases" value={aliasesText} onChange={(e) => setAliasesText(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agents">适用智能体 id（如 content_producer）</Label>
            <Input id="agents" value={agentsText} onChange={(e) => setAgentsText(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">简介</Label>
            <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm">状态</Label>
            <Button
              type="button"
              size="sm"
              variant={status === "active" ? "default" : "outline"}
              onClick={() => setStatus("active")}
            >
              启用
            </Button>
            <Button
              type="button"
              size="sm"
              variant={status === "archived" ? "default" : "outline"}
              onClick={() => setStatus("archived")}
            >
              归档
            </Button>
            <Button onClick={saveMeta} disabled={savingMeta}>
              {savingMeta ? <Loader2 className="size-4 animate-spin" /> : null}
              保存基础信息
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">规则正文（进 prompt 的那份）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={18}
            value={compiledPrompt}
            onChange={(e) => setCompiledPrompt(e.target.value)}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={savingVersion} onClick={() => createVersion("draft")}>
              存为草稿版本
            </Button>
            <Button disabled={savingVersion} onClick={() => createVersion("published")}>
              {savingVersion ? <Loader2 className="size-4 animate-spin" /> : null}
              发布为新版本
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">版本历史</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version}</span>
                  <Badge variant={v.status === "published" ? "default" : "secondary"}>
                    {v.status === "published" ? "已发布" : "草稿"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">checksum {v.checksum.slice(0, 12)}…</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  创建于 {new Date(v.createdAt).toLocaleString("zh-CN")}
                  {v.publishedAt ? ` · 发布于 ${new Date(v.publishedAt).toLocaleString("zh-CN")}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCompiledPrompt(v.compiledPrompt)
                    toast.message(`已载入 v${v.version} 到编辑框`)
                  }}
                >
                  载入编辑
                </Button>
                {v.status === "draft" ? (
                  <Button size="sm" disabled={savingVersion} onClick={() => publishVersion(v.id)}>
                    发布此草稿
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
