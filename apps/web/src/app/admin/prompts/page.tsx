"use client"

import React, { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import {
  AdminApiError,
  createAdminPromptDraft,
  listAdminPrompts,
  promoteAdminPromptVersion,
  type AdminPromptTemplate,
} from "@/lib/api/admin-prompts"

/**
 * Prompt 资产管理（Step① 治理闭环 P2）：
 * 列表 → 新建草稿版本 → 按门禁升级（qualified 需 fixtureKey；active 唯一）。
 * 状态含义：draft 草稿 / qualified 评测通过 / active 线上生效（每 key 唯一）。
 */

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "线上生效", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  qualified: { label: "评测通过", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  draft: { label: "草稿", className: "bg-muted text-muted-foreground" },
}

export default function AdminPromptsPage() {
  const [templates, setTemplates] = useState<AdminPromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  // 新建版本 dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newDomain, setNewDomain] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newFixtureKey, setNewFixtureKey] = useState("")
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listAdminPrompts()
      setTemplates(data.templates)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate() {
    if (!newKey.trim() || !newContent.trim()) {
      toast.error("key 与内容必填")
      return
    }
    setSaving(true)
    try {
      const created = await createAdminPromptDraft({
        key: newKey.trim(),
        content: newContent,
        ...(newFixtureKey.trim() ? { fixtureKey: newFixtureKey.trim() } : {}),
        ...(newDomain.trim() ? { domain: newDomain.trim() } : {}),
      })
      toast.success(`已创建草稿 v${created.version}`)
      setCreateOpen(false)
      setNewKey("")
      setNewDomain("")
      setNewContent("")
      setNewFixtureKey("")
      await reload()
      setOpenKey(created.key)
    } catch (error) {
      toast.error(error instanceof AdminApiError ? error.message : "创建失败")
    } finally {
      setSaving(false)
    }
  }

  async function handlePromote(key: string, version: number, toStatus: "qualified" | "active") {
    try {
      const result = await promoteAdminPromptVersion({ key, version, toStatus })
      toast.success(
        toStatus === "active"
          ? `v${version} 已上线生效${result.demotedToQualified > 0 ? `（旧版本回落评测通过）` : ""}`
          : `v${version} 已转为评测通过`,
      )
      await reload()
    } catch (error) {
      toast.error(error instanceof AdminApiError ? error.message : "操作失败")
    }
  }

  return (
    <AdminPageShell
      title="Prompt 资产"
      subtitle="每个 key 的版本正本：草稿 → 评测通过（需 fixtureKey）→ 线上生效；升级后即时热更，无需发版。"
      loading={loading}
      error={loadError}
      onRetry={() => void reload()}
      empty={templates.length === 0}
      emptyMessage="暂无 prompt 资产"
      actions={
        <Button onClick={() => setCreateOpen(true)}>新建版本</Button>
      }
    >
      <div className="space-y-3">
        {templates.map((template) => {
          const expanded = openKey === template.key
          const activeVersion = template.versions.find((v) => v.status === "active")
          return (
            <Card key={template.key}>
              <CardContent className="p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setOpenKey(expanded ? null : template.key)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{template.key}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {template.domain} · {template.versions.length} 个版本
                      {activeVersion ? ` · 线上 v${activeVersion.version}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{STATUS_BADGE[activeVersion?.status ?? "draft"].label}</Badge>
                </button>

                {expanded ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {template.versions.map((version) => (
                      <div
                        key={version.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-xs font-medium">
                            v{version.version}
                            <Badge className={STATUS_BADGE[version.status]?.className}>
                              {STATUS_BADGE[version.status]?.label ?? version.status}
                            </Badge>
                            {version.fixtureKey ? (
                              <span className="text-muted-foreground">fixture: {version.fixtureKey}</span>
                            ) : null}
                          </p>
                          <p className="mt-1 line-clamp-2 font-mono text-[11px] leading-4 text-muted-foreground">
                            {version.contentPreview}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {version.status !== "active" && version.status !== "qualified" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handlePromote(template.key, version.version, "qualified")}
                            >
                              转评测通过
                            </Button>
                          ) : null}
                          {version.status !== "active" ? (
                            <Button
                              size="sm"
                              onClick={() => void handlePromote(template.key, version.version, "active")}
                            >
                              上线生效
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建 Prompt 版本</DialogTitle>
            <DialogDescription>
              新版本以草稿落库；升「评测通过」必须填 fixtureKey，升「线上生效」前需先过评测。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="prompt-key">key（如 aim.work_editor.chat；已登记 key 可从下拉选择）</Label>
              <Input
                id="prompt-key"
                list="prompt-key-options"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="domain.capability.variant"
              />
              <datalist id="prompt-key-options">
                {templates.map((template) => (
                  <option key={template.key} value={template.key} />
                ))}
              </datalist>
            </div>
            {!templates.some((t) => t.key === newKey.trim()) ? (
              <div className="grid gap-2">
                <Label htmlFor="prompt-domain">domain（未登记 key 首个版本必填，如 aim / brief）</Label>
                <Input
                  id="prompt-domain"
                  value={newDomain}
                  onChange={(event) => setNewDomain(event.target.value)}
                  placeholder="aim"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="prompt-fixture">fixtureKey（评测集标识，升级评测通过时必须）</Label>
              <Input
                id="prompt-fixture"
                value={newFixtureKey}
                onChange={(event) => setNewFixtureKey(event.target.value)}
                placeholder="eval.work_editor.v2"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prompt-content">prompt 内容</Label>
              <Textarea
                id="prompt-content"
                rows={10}
                value={newContent}
                onChange={(event) => setNewContent(event.target.value)}
                placeholder="完整 system prompt 原文……"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>
              {saving ? "保存中……" : "创建草稿版本"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  )
}
