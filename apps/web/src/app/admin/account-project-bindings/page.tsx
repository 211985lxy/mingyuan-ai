"use client"

import React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import {
  bindAccountProject,
  createAccountProjectRepairConfirmation,
  getAccountProjectBindings,
  getAccountProjectRepairPreview,
  repairAccountProjectBinding,
  type AccountProjectBindingItem,
  type AccountProjectRepairImpact,
} from "@/lib/api/admin-client"

type ActionMode = "recover" | "repair"

const STATUS_LABELS: Record<AccountProjectBindingItem["status"], string> = {
  bound: "已绑定",
  admin_review_required: "待管理员确认",
  setup_required: "待创建项目",
  inactive_project_recovery_required: "待恢复停用项目",
}

const STATUS_VARIANTS: Record<AccountProjectBindingItem["status"], "default" | "secondary" | "outline"> = {
  bound: "default",
  admin_review_required: "secondary",
  setup_required: "outline",
  inactive_project_recovery_required: "outline",
}

const MODE_TITLES: Record<ActionMode, string> = {
  recover: "恢复停用项目并绑定",
  repair: "修复错误绑定",
}

function isInactive(status: string) {
  return status === "paused" || status === "archived"
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("zh-CN")
}

function ImpactSummary({ impact, reactivate }: { impact: AccountProjectRepairImpact; reactivate: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="space-y-1.5">
          <p>
            当前绑定：
            {impact.currentBinding
              ? `${impact.currentBinding.name}（${impact.currentBinding.status === "active" ? "active" : impact.currentBinding.status}）`
              : "尚未绑定"}
          </p>
          <p>
            目标项目：
            <span className="font-medium">{impact.targetProject.name}</span>
            {impact.targetProject.status !== "active" ? `（${impact.targetProject.status}${reactivate ? "，将恢复为 active" : ""}）` : "（active）"}
          </p>
          <p>
            目标项目现有内容：知识 {impact.targetContentCounts.knowledgeEntries} 条 · 脚本{" "}
            {impact.targetContentCounts.scripts} 篇 · 生成记录 {impact.targetContentCounts.aimGenerations} 条
          </p>
          <p>
            将被隔离：运行中调用 {impact.wouldCancel.agentInvocations} 个 · 后台任务{" "}
            {impact.wouldCancel.backgroundTasks} 个
          </p>
          <p>历史记录无法自动归属到新项目：{impact.unattributedHistoryCount} 条（保留在原项目，不做改写）</p>
        </div>
      </div>
    </div>
  )
}

function RepairDialog(props: {
  item: AccountProjectBindingItem
  mode: ActionMode
  onClose: () => void
  onDone: () => void
}) {
  const { item, mode, onClose, onDone } = props

  const boundProject = item.projects.find((project) => project.id === item.boundProjectId)
  const boundProjectActive = Boolean(boundProject && boundProject.status === "active")
  // 修复：排除“当前绑定且为 active”的项目（无变化）；停用项目一律可作为候选（需恢复）。
  const candidates = item.projects.filter(
    (project) => !(project.id === item.boundProjectId && project.status === "active"),
  )

  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("")
  const [reactivate, setReactivate] = React.useState(mode === "recover")
  const [reason, setReason] = React.useState("")
  const [impact, setImpact] = React.useState<AccountProjectRepairImpact | null>(null)
  const [confirmToken, setConfirmToken] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<"preview" | "mint" | "exec" | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const selectedProject = candidates.find((project) => project.id === selectedProjectId) ?? null
  const selectedInactive = Boolean(selectedProject && isInactive(selectedProject.status))
  const reasonTrimmed = reason.trim()

  function resetConfirmation() {
    setConfirmToken(null)
    setError(null)
  }

  function selectProject(projectId: string) {
    if (projectId === selectedProjectId) return
    setSelectedProjectId(projectId)
    setImpact(null)
    setConfirmToken(null)
    setError(null)
    const project = candidates.find((candidate) => candidate.id === projectId)
    setReactivate(Boolean(project && isInactive(project.status) && mode === "recover"))
  }

  async function handlePreview() {
    if (!selectedProjectId) {
      setError("请先选择一个目标项目")
      return
    }
    setBusy("preview")
    setError(null)
    try {
      const response = await getAccountProjectRepairPreview(item.userId, selectedProjectId, reactivate)
      setImpact(response.impact)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "预览失败")
    } finally {
      setBusy(null)
    }
  }

  async function handleMintConfirmation() {
    if (!selectedProjectId || !reasonTrimmed) {
      setError("请选择目标项目并填写原因")
      return
    }
    setBusy("mint")
    setError(null)
    try {
      const response = await createAccountProjectRepairConfirmation(item.userId, {
        projectId: selectedProjectId,
        reason: reasonTrimmed,
        reactivate,
      })
      setImpact(response.impact)
      setConfirmToken(response.token)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成确认信息失败")
    } finally {
      setBusy(null)
    }
  }

  async function handleExecute() {
    if (!confirmToken || !reasonTrimmed) return
    setBusy("exec")
    setError(null)
    try {
      await repairAccountProjectBinding(item.userId, { token: confirmToken, reason: reasonTrimmed })
      toast.success(mode === "recover" ? "停用项目已恢复并绑定" : "账号项目绑定已修复")
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修复失败")
      setConfirmToken(null)
    } finally {
      setBusy(null)
    }
  }

  const canMint =
    Boolean(selectedProjectId)
    && reasonTrimmed.length > 0
    && !(selectedInactive && !reactivate)
    && busy === null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{MODE_TITLES[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "recover"
              ? "该账号只拥有停用（paused/archived）项目。选择要恢复的项目并绑定，恢复/改绑会做影响确认并写入审计。"
              : "该账号当前绑定到其他项目。选择正确归属后执行修复，旧项目的在途任务会被隔离，全程审计。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {boundProject && (
            <p className="text-sm text-muted-foreground">
              当前绑定：<span className="font-medium text-foreground">{boundProject.name}</span>
              {!boundProjectActive && <Badge className="ml-2" variant="outline">{boundProject.status}</Badge>}
            </p>
          )}

          <div>
            <Label>目标项目</Label>
            <div className="mt-2 flex flex-col gap-2">
              {candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">没有可修复/恢复的项目候选。</p>
              )}
              {candidates.map((project) => {
                const selected = project.id === selectedProjectId
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => selectProject(project.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {project.id === item.boundProjectId && <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="truncate font-medium">{project.name}</span>
                    </span>
                    {isInactive(project.status) ? (
                      <Badge variant="outline">{project.status}</Badge>
                    ) : (
                      <Badge>active</Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedInactive && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={reactivate}
                onCheckedChange={(checked) => {
                  setReactivate(checked === true)
                  resetConfirmation()
                }}
              />
              <span>
                将该停用项目恢复为 <span className="font-medium">active</span> 后再绑定
              </span>
            </label>
          )}

          <div>
            <Label>修复 / 恢复原因</Label>
            <Textarea
              className="mt-2"
              rows={2}
              placeholder="必填：记录在管理员审计日志中，例如“项目归属错误，改绑至 B 项目”"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                resetConfirmation()
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedProjectId || busy !== null}
              onClick={() => void handlePreview()}
            >
              {busy === "preview" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
              预览影响
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canMint}
              onClick={() => void handleMintConfirmation()}
            >
              {busy === "mint" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="mr-1 h-3.5 w-3.5" />}
              生成二次确认
            </Button>
          </div>

          {impact && <ImpactSummary impact={impact} reactivate={reactivate} />}
          {selectedInactive && !reactivate && (
            <p className="text-xs text-amber-700 dark:text-amber-400">停用项目需要先勾选“恢复为 active”。</p>
          )}
          {!confirmToken && reasonTrimmed && impact && (
            <p className="text-xs text-muted-foreground">
              请核对上述影响摘要并点击「生成二次确认」；随后按钮才会允许执行。
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy !== null}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!confirmToken || busy !== null}
            onClick={() => void handleExecute()}
          >
            {busy === "exec" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            {confirmToken ? "确认执行修复" : "已生成确认后执行"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AccountProjectBindingsPage() {
  const [items, setItems] = React.useState<AccountProjectBindingItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [bindingKey, setBindingKey] = React.useState<string | null>(null)
  const [dialog, setDialog] = React.useState<{ item: AccountProjectBindingItem; mode: ActionMode } | null>(null)

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getAccountProjectBindings()
      setItems(response.data)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "账号绑定状态读取失败"
      setError(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadItems()
  }, [loadItems])

  async function handleBind(userId: string, projectId: string) {
    const key = `${userId}:${projectId}`
    setBindingKey(key)
    try {
      await bindAccountProject(userId, projectId)
      toast.success("账号项目绑定已完成")
      await loadItems()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "账号项目绑定失败")
    } finally {
      setBindingKey(null)
    }
  }

  const reviewCount = items.filter((item) => item.status === "admin_review_required").length
  const recoveryCount = items.filter((item) => item.status === "inactive_project_recovery_required").length
  const boundProjectOf = (item: AccountProjectBindingItem) =>
    item.projects.find((project) => project.id === item.boundProjectId)

  function hasRepairCandidates(item: AccountProjectBindingItem) {
    return item.projects.some(
      (project) => !(project.id === item.boundProjectId && project.status === "active"),
    )
  }

  return (
    <AdminPageShell
      title="账号项目绑定"
      subtitle="一个 AIM 登录账号绑定一个 IP 项目；同一项目可继续挂接多个抖音、微信视频号等渠道账号。"
      loading={loading}
      error={error}
      onRetry={loadItems}
      skeletonRows={5}
      empty={!loading && !error && items.length === 0}
      emptyMessage="暂无 AIM 登录账号"
    >
      {(reviewCount > 0 || recoveryCount > 0) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            有 {reviewCount} 个账号已有历史项目但尚未绑定；有 {recoveryCount} 个账号只剩停用项目需要恢复。
            请逐个确认归属后再处理：首次绑定、恢复停用项目、修复错误绑定均会写入审计。
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">账号</th>
                  <th className="p-3 text-left font-medium">状态</th>
                  <th className="p-3 text-left font-medium">绑定项目</th>
                  <th className="p-3 text-left font-medium">操作</th>
                  <th className="p-3 text-left font-medium">绑定时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const boundProject = boundProjectOf(item)
                  return (
                    <tr key={item.userId} className="border-b align-top last:border-0 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-start gap-2">
                          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="font-medium">{item.name || "未命名账号"}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANTS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      </td>
                      <td className="p-3">
                        {boundProject ? (
                          <div className="flex items-center gap-1.5">
                            {boundProject.status === "active" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            )}
                            <span>{boundProject.name}</span>
                            {boundProject.status !== "active" && (
                              <Badge variant="outline">{boundProject.status}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">尚未绑定</span>
                        )}
                      </td>
                      <td className="p-3">
                        {item.status === "admin_review_required" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">首次绑定：</span>
                            {item.projects.filter((project) => project.status === "active").map((project) => {
                              const key = `${item.userId}:${project.id}`
                              const busy = bindingKey === key
                              return (
                                <Button
                                  key={project.id}
                                  size="sm"
                                  variant="outline"
                                  disabled={bindingKey !== null}
                                  onClick={() => void handleBind(item.userId, project.id)}
                                >
                                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
                                  {project.name}
                                </Button>
                              )
                            })}
                          </div>
                        ) : item.status === "inactive_project_recovery_required" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">恢复停用项目：</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ item, mode: "recover" })}
                            >
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              选择项目并恢复
                            </Button>
                          </div>
                        ) : item.status === "setup_required" ? (
                          <span className="text-muted-foreground">等待账号首次创建项目</span>
                        ) : (
                          hasRepairCandidates(item) ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {boundProject && boundProject.status !== "active" ? "修复绑定：" : "修复错误绑定："}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDialog({ item, mode: "repair" })}
                              >
                                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                {boundProject && boundProject.status !== "active" ? "恢复绑定项目/改绑" : "改绑到正确项目"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">已锁定为绑定项目</span>
                          )
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDate(item.projectBoundAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {dialog && (
        <RepairDialog
          item={dialog.item}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            void loadItems()
          }}
        />
      )}
    </AdminPageShell>
  )
}
