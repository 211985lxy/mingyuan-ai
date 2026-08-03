"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Plus, Search, BrainCircuit, BookOpen, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProjectKnowledgeAssetHealth } from "@/components/projects/project-knowledge-asset-health"
import { CustomerKnowledgeEntryDialog } from "@/features/knowledge/components/customer-knowledge-entry-dialog"
import { CustomerSmartImportDialog } from "@/features/knowledge/components/customer-smart-import-dialog"
import { ExternalAiMemoryImportDialog } from "@/features/knowledge/components/external-ai-memory-import-dialog"
import { CustomerKnowledgeEntryCard } from "@/features/knowledge/components/customer-knowledge-entry-card"
import { useCustomerKnowledgeWorkspace } from "@/features/knowledge/hooks/use-customer-knowledge-workspace"
import { CATEGORY_GROUPS, CATEGORY_LABELS, KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"
import type { KnowledgeEntry } from "@/lib/api/client"
import { cn } from "@/lib/utils"

const ALL_CATEGORIES = KNOWLEDGE_CATEGORIES as readonly string[]

function countByCategory(entries: KnowledgeEntry[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const e of entries) map[e.category] = (map[e.category] ?? 0) + 1
  return map
}

export function CustomerKnowledgeWorkspace() {
  const ws = useCustomerKnowledgeWorkspace()
  const searchParams = useSearchParams()
  const [accountProjectId, setAccountProjectId] = useState<string | null>(null)
  const [openGapRequest, setOpenGapRequest] = useState(0)
  const [busy, setBusy] = useState(false)

  const memoryDefaultProjectId =
    ws.projectFilter !== "all" && ws.projectFilter !== "none"
      ? ws.projectFilter
      : accountProjectId ?? ws.defaultAccountId ?? undefined

  useEffect(() => {
    if (ws.defaultAccountId) setAccountProjectId(ws.defaultAccountId)
  }, [ws.defaultAccountId])

  async function openAccountMaterials() {
    setBusy(true)
    try {
      const project = await ws.ensureAccount()
      setAccountProjectId(project.id)
      setOpenGapRequest((n) => n + 1)
    } catch {
      toast.error("暂时无法打开账户资料，请稍后重试")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (ws.loading) return
    if (searchParams?.get("intent") !== "add-account") return
    void openAccountMaterials()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.loading, searchParams])

  const healthProjectId = accountProjectId ?? ws.defaultAccountId
  const counts = countByCategory(ws.entries)
  const totalCount = ws.entries.length
  const activeCount = ws.entries.filter((e) => e.status === "active").length

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6 sm:px-6">
      {/* 左栏：分类导航 */}
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-12 space-y-4">
          <button
            onClick={() => ws.setCategoryFilter("all")}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
              ws.categoryFilter === "all"
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <span>全部资料</span>
            <span className="text-xs text-muted-foreground/70">{totalCount}</span>
          </button>

          {Object.entries(CATEGORY_GROUPS).map(([group, cats]) => (
            <div key={group}>
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground/60">{group}</p>
              {cats.map((cat) => (
                <button
                  key={cat}
                  onClick={() => ws.setCategoryFilter(cat)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors",
                    ws.categoryFilter === cat
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                  {counts[cat] ? (
                    <span className="text-xs text-muted-foreground/60">{counts[cat]}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}

          <div className="border-t border-border/40 pt-3">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={ws.openSmartImport}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />拖文件入库
            </Button>
            <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground" onClick={ws.openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />手动一条
            </Button>
            <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground" onClick={ws.openMemoryImport}>
              <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />粘贴记忆
            </Button>
          </div>
        </div>
      </aside>

      {/* 右栏：搜索 + 列表 */}
      <div className="min-w-0 flex-1">
        {/* 顶部 */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">我的知识库</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              装账户原料——写稿去创作台，两边不重复。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={ws.openSmartImport}>
              <Upload className="mr-1.5 h-4 w-4" />
              拖文件入库
            </Button>
            <Button onClick={() => void openAccountMaterials()} disabled={busy || ws.ensuringAccount} size="sm">
              {(busy || ws.ensuringAccount) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              塞一条经验进去
            </Button>
          </div>
        </div>

        {/* 资产健康 */}
        {healthProjectId ? (
          <div className="mb-4">
            <ProjectKnowledgeAssetHealth
              projectId={healthProjectId}
              variant="chips"
              openGapRequest={openGapRequest}
              onAllReady={() => ws.openCreate()}
              onSaved={() => void ws.load()}
            />
          </div>
        ) : null}

        {/* 搜索栏 */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={ws.keyword}
            onChange={(e) => ws.setKeyword(e.target.value)}
            placeholder="搜索标题、内容或标签"
            className="pl-9"
          />
        </div>

        {/* 移动端分类筛选 */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto md:hidden">
          <button
            onClick={() => ws.setCategoryFilter("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs",
              ws.categoryFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            全部 {totalCount}
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => ws.setCategoryFilter(cat)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs",
                ws.categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>

        {/* 列表 */}
        {ws.loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载知识库…
          </div>
        ) : ws.loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">{ws.loadError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void ws.load()}>重试</Button>
          </div>
        ) : ws.visibleEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-16 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">还没有符合条件的知识</p>
            <p className="mt-1 text-sm text-muted-foreground">可以拖文件进来自动清洗入库，或手动写一条。</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={ws.openSmartImport}>
                <Upload className="mr-1.5 h-4 w-4" />
                拖文件入库
              </Button>
              <Button size="sm" onClick={ws.openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                手动一条
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{activeCount} 条使用中</p>
            {ws.visibleEntries.map((entry) => (
              <CustomerKnowledgeEntryCard
                key={entry.id}
                entry={entry}
                projectName={entry.projectId ? ws.projectNameById.get(entry.projectId) || "项目资料" : "全局资料"}
                archiving={ws.archivingId === entry.id}
                onEdit={() => ws.openEdit(entry)}
                onArchive={() => void ws.handleArchive(entry)}
              />
            ))}
          </div>
        )}
      </div>

      <CustomerKnowledgeEntryDialog
        open={ws.dialogOpen}
        mode={ws.dialogMode}
        form={ws.form}
        projects={ws.projects}
        saving={ws.saving}
        onOpenChange={ws.setDialogOpen}
        onFormChange={ws.setForm}
        onSave={() => void ws.handleSave()}
      />
      <ExternalAiMemoryImportDialog
        open={ws.memoryImportOpen}
        projects={ws.projects}
        defaultProjectId={memoryDefaultProjectId}
        onOpenChange={ws.setMemoryImportOpen}
        onImported={() => void ws.load()}
      />
      <CustomerSmartImportDialog
        open={ws.smartImportOpen}
        projects={ws.projects}
        defaultProjectId={memoryDefaultProjectId}
        onOpenChange={ws.setSmartImportOpen}
        onImported={() => void ws.load()}
      />
    </div>
  )
}
