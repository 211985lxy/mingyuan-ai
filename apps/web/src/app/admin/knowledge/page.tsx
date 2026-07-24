"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KnowledgeMap } from "@/components/admin/knowledge-map"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { AdminKnowledgeBrowseTab } from "@/components/admin/admin-knowledge-browse-tab"
import { KnowledgeDetailDialog, KnowledgeDistillDialog } from "@/features/knowledge/components/knowledge-review-dialogs"
import { KnowledgeEntryDialog, KnowledgeUploadDialog } from "@/features/knowledge/components/knowledge-entry-dialogs"
import { SmartImportDialog } from "@/features/knowledge/components/smart-import-dialog"
import { KnowledgeListTab } from "@/features/knowledge/components/knowledge-list-tab"
import { useAdminKnowledgePage } from "@/hooks/use-admin-knowledge-page"

export default function AdminKnowledgePage() {
  const k = useAdminKnowledgePage()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="知识库"
        description="按项目管理资料，优先处理待整理内容，再沉淀为可供智能体调用的核心知识。"
      />

      <Tabs value={k.activeTab} onValueChange={k.setActiveTab}>
        <TabsList>
          <TabsTrigger value="browser">知识工作台</TabsTrigger>
          <TabsTrigger value="map">高级：知识地图</TabsTrigger>
          <TabsTrigger value="list">高级：条目管理</TabsTrigger>
        </TabsList>

        <TabsContent value="browser">
          <AdminKnowledgeBrowseTab
            browserEntries={k.browserEntries}
            browserTotal={k.browserTotal}
            browserLoading={k.browserLoading}
            browserPage={k.browserPage}
            browserPageSize={k.browserPageSize}
            projects={k.projects as unknown as import("@/components/admin/knowledge-browser").AdminProject[]}
            browserStats={k.browserStats}
            browserProject={k.browserProject}
            browserCategory={k.browserCategory}
            browserSearchInput={k.browserSearchInput}
            selectedIds={k.selectedIds}
            assetHealth={k.assetHealth}
            onSelectProject={(value) => {
              k.setBrowserProject(value)
              k.setBrowserCategory("")
              k.setBrowserPage(1)
            }}
            onSelectCategory={(value) => {
              k.setBrowserCategory(value)
              k.setBrowserPage(1)
            }}
            onSearchChange={k.setBrowserSearchInput}
            onPageChange={k.setBrowserPage}
            onToggleSelect={k.toggleSelect}
            onOpenDetail={k.setDetailEntry}
            onManualAdd={() => k.openAddForBrowser(k.browserProject)}
            onUpload={() => k.openUploadForBrowser(k.browserProject)}
            onSmartImport={() => k.openSmartImportForBrowser(k.browserProject)}
            onSupplement={k.openSupplement}
          />
        </TabsContent>

        <TabsContent value="map">
          <KnowledgeMap
            projects={k.projects}
            onDrillDown={(filters) => {
              if (filters.category) {
                k.setBrowserCategory(filters.category)
                k.setBrowserPage(1)
                k.setActiveTab("browser")
              }
            }}
          />
        </TabsContent>

        <KnowledgeListTab
          entries={k.entries}
          loading={k.loading}
          search={k.search}
          categoryFilter={k.categoryFilter}
          projectFilter={k.projectFilter}
          cleanupFilter={k.cleanupFilter}
          gradeFilter={k.gradeFilter}
          projects={k.projects}
          selectedIds={k.selectedIds}
          page={k.page}
          pageSize={k.pageSize}
          total={k.total}
          totalPages={k.totalPages}
          onSearch={k.handleSearch}
          onSearchChange={k.setSearch}
          onCategoryChange={(value) => {
            k.setCategoryFilter(value)
            k.setPage(1)
          }}
          onProjectChange={(value) => {
            k.setProjectFilter(value)
            k.setPage(1)
          }}
          onCleanupChange={(value) => {
            k.setCleanupFilter(value)
            k.setSelectedIds(new Set())
          }}
          onGradeChange={(value) => {
            k.setGradeFilter(value)
            k.setPage(1)
          }}
          onOpenAdd={() => k.setAddDialogOpen(true)}
          onOpenUpload={() => k.setUploadDialogOpen(true)}
          onOpenSmartImport={() => k.setSmartImportOpen(true)}
          onToggleSelect={k.toggleSelect}
          onToggleSelectAll={k.toggleSelectAll}
          onOpenDetail={k.setDetailEntry}
          onSuggestCleanup={k.handleSuggestCleanup}
          onDistill={k.handleDistill}
          onBatchChangeGrade={k.handleBatchChangeGrade}
          onBatchArchive={k.handleBatchArchive}
          onBatchDelete={k.handleBatchDelete}
          onPageChange={k.setPage}
        />
      </Tabs>

      <KnowledgeDetailDialog entry={k.detailEntry} onClose={() => k.setDetailEntry(null)} />
      <KnowledgeDistillDialog
        open={k.distillDialogOpen}
        loading={k.distilling}
        result={k.distillResult}
        onOpenChange={k.setDistillDialogOpen}
      />

      <KnowledgeEntryDialog
        open={k.addDialogOpen}
        form={k.editForm}
        projects={k.projects}
        saving={k.saving}
        onOpenChange={k.setAddDialogOpen}
        onFormChange={k.setEditForm}
        onSave={k.handleAddEntry}
      />
      <KnowledgeUploadDialog
        open={k.uploadDialogOpen}
        file={k.uploadFile}
        category={k.uploadCategory}
        projectId={k.uploadProjectId}
        projects={k.projects}
        uploading={k.uploading}
        onOpenChange={k.setUploadDialogOpen}
        onFileChange={k.setUploadFile}
        onCategoryChange={k.setUploadCategory}
        onProjectChange={k.setUploadProjectId}
        onUpload={k.handleUploadFile}
      />

      <SmartImportDialog
        open={k.smartImportOpen}
        projectId={k.smartImportProjectId}
        projects={k.projects}
        onOpenChange={k.setSmartImportOpen}
        onProjectChange={k.setSmartImportProjectId}
        onImported={k.fetchData}
      />
    </div>
  )
}
