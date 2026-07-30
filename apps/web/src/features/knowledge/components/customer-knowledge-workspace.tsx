"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BrainCircuit, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ProjectKnowledgeAssetHealth } from "@/components/projects/project-knowledge-asset-health"
import { CustomerKnowledgeEntryDialog } from "@/features/knowledge/components/customer-knowledge-entry-dialog"
import { CustomerKnowledgeFilters } from "@/features/knowledge/components/customer-knowledge-filters"
import { CustomerKnowledgeListPanel } from "@/features/knowledge/components/customer-knowledge-list-panel"
import { ExternalAiMemoryImportDialog } from "@/features/knowledge/components/external-ai-memory-import-dialog"
import { useCustomerKnowledgeWorkspace } from "@/features/knowledge/hooks/use-customer-knowledge-workspace"

/**
 * 知识库 = 账户原料（人设/产品/案例），不是写稿台。
 * 主入口只有「添加账户资料」；其它为次要。
 */
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的知识库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            装账户原料。写稿请去创作台——两边不重复。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void openAccountMaterials()}
            disabled={busy || ws.ensuringAccount}
          >
            {(busy || ws.ensuringAccount) ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            添加账户资料
          </Button>
          <Button variant="ghost" size="sm" onClick={ws.openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            手动一条
          </Button>
          <Button variant="ghost" size="sm" onClick={ws.openMemoryImport}>
            <BrainCircuit className="mr-1 h-3.5 w-3.5" />
            粘贴记忆
          </Button>
        </div>
      </div>

      {healthProjectId ? (
        <ProjectKnowledgeAssetHealth
          projectId={healthProjectId}
          variant="panel"
          openGapRequest={openGapRequest}
          onSaved={() => void ws.load()}
        />
      ) : null}

      <CustomerKnowledgeFilters
        keyword={ws.keyword}
        onKeywordChange={ws.setKeyword}
        projectFilter={ws.projectFilter}
        onProjectFilterChange={ws.setProjectFilter}
        categoryFilter={ws.categoryFilter}
        onCategoryFilterChange={ws.setCategoryFilter}
        statusFilter={ws.statusFilter}
        onStatusFilterChange={ws.setStatusFilter}
        projects={ws.projects}
      />

      <CustomerKnowledgeListPanel
        loading={ws.loading}
        loadError={ws.loadError}
        entries={ws.visibleEntries}
        projectNameById={ws.projectNameById}
        archivingId={ws.archivingId}
        onRetry={() => void ws.load()}
        onEdit={ws.openEdit}
        onArchive={(entry) => void ws.handleArchive(entry)}
      />

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
    </div>
  )
}
