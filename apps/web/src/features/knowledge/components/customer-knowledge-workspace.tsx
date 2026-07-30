"use client"

import { BrainCircuit, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CustomerKnowledgeEntryDialog } from "@/features/knowledge/components/customer-knowledge-entry-dialog"
import { CustomerKnowledgeFilters } from "@/features/knowledge/components/customer-knowledge-filters"
import { CustomerKnowledgeListPanel } from "@/features/knowledge/components/customer-knowledge-list-panel"
import { ExternalAiMemoryImportDialog } from "@/features/knowledge/components/external-ai-memory-import-dialog"
import { useCustomerKnowledgeWorkspace } from "@/features/knowledge/hooks/use-customer-knowledge-workspace"

export function CustomerKnowledgeWorkspace() {
  const ws = useCustomerKnowledgeWorkspace()
  const memoryDefaultProjectId =
    ws.projectFilter !== "all" && ws.projectFilter !== "none" ? ws.projectFilter : undefined

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">我的知识库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理你自己的业务资料。AIM 写稿时会按项目调用这里的内容。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={ws.openMemoryImport}>
            <BrainCircuit className="mr-1.5 h-4 w-4" />
            粘贴外部记忆
          </Button>
          <Button onClick={ws.openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增知识
          </Button>
        </div>
      </div>

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
