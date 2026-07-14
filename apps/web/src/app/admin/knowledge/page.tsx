"use client"

import React from "react"
import { toast } from "sonner"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { buildKnowledgeCleaningSuggestion, parseKnowledgeTags } from "@/lib/knowledge-tags"
import { KnowledgeMap } from "@/components/admin/knowledge-map"
import { KnowledgeBrowser, type KnowledgeEntry as BrowserKnowledgeEntry, type AdminProject as BrowserAdminProject } from "@/components/admin/knowledge-browser"
import { KnowledgeDetailDialog, KnowledgeDistillDialog } from "@/features/knowledge/components/knowledge-review-dialogs"
import { KnowledgeEntryDialog, KnowledgeUploadDialog } from "@/features/knowledge/components/knowledge-entry-dialogs"
import { SmartImportDialog } from "@/features/knowledge/components/smart-import-dialog"
import { KnowledgeListTab } from "@/features/knowledge/components/knowledge-list-tab"
import {
  batchAction,
  deleteEntries,
  distillEntries,
  fetchKnowledge,
  fetchProjects,
  type AdminProject,
  type DistillResult,
  type KnowledgeEntry,
} from "@/features/knowledge/admin-knowledge-shared"

export default function AdminKnowledgePage() {
  // 列表状态
  const [entries, setEntries] = React.useState<KnowledgeEntry[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("")
  const [projectFilter, setProjectFilter] = React.useState("")
  const [cleanupFilter, setCleanupFilter] = React.useState("")
  const [gradeFilter, setGradeFilter] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const pageSize = 20

  // 项目
  const [projects, setProjects] = React.useState<AdminProject[]>([])

  // Tab 切换：默认进入「知识浏览」，进入即可看到具体内容
  const [activeTab, setActiveTab] = React.useState("browser")

  // 选中
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [detailEntry, setDetailEntry] = React.useState<KnowledgeEntry | null>(null)

  // 蒸馏
  const [distillDialogOpen, setDistillDialogOpen] = React.useState(false)
  const [distillResult, setDistillResult] = React.useState<DistillResult | null>(null)
  const [distilling, setDistilling] = React.useState(false)

  // 新增/编辑
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [editForm, setEditForm] = React.useState({
    title: "",
    content: "",
    category: "product_usp",
    tags: "",
    sourceType: "manual" as string,
    projectId: "none",
    valueGrade: "" as string,
  })
  const [saving, setSaving] = React.useState(false)

  // 上传
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [uploadFile, setUploadFile] = React.useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = React.useState("product_usp")
  const [uploadProjectId, setUploadProjectId] = React.useState("none")
  const [uploading, setUploading] = React.useState(false)

  // 智能导入
  const [smartImportOpen, setSmartImportOpen] = React.useState(false)
  const [smartImportProjectId, setSmartImportProjectId] = React.useState("none")

  // 知识浏览 Tab（默认）：独立的列表状态，与「条目列表」Tab 解耦，但共享 projectFilter/categoryFilter
  // 这样「知识地图」的下钻（设置 categoryFilter）也能联动浏览视图
  const [browserEntries, setBrowserEntries] = React.useState<BrowserKnowledgeEntry[]>([])
  const [browserTotal, setBrowserTotal] = React.useState(0)
  const [browserPage, setBrowserPage] = React.useState(1)
  const [browserSearch, setBrowserSearch] = React.useState("")
  const [browserSearchInput, setBrowserSearchInput] = React.useState("")
  const [browserLoading, setBrowserLoading] = React.useState(false)
  const browserPageSize = 20
  // 浏览视图的导航筛选（项目 / 分类）。默认全部，不与条目列表的筛选互相干扰
  const [browserProject, setBrowserProject] = React.useState("")
  const [browserCategory, setBrowserCategory] = React.useState("")
  // 浏览视图的分类计数（来自 /stats，按当前选中项目刷新）
  const [browserStats, setBrowserStats] = React.useState<{
    totalEntries: number
    categoryDistribution: Array<{ category: string; categoryLabel: string; count: number }>
  } | null>(null)

  const fetchBrowserData = React.useCallback(async () => {
    setBrowserLoading(true)
    try {
      const res = await fetchKnowledge({
        page: browserPage,
        pageSize: browserPageSize,
        search: browserSearch,
        category: browserCategory,
        projectId: browserProject,
      })
      setBrowserEntries(Array.isArray(res.data?.results) ? res.data.results : [])
      setBrowserTotal(typeof res.data?.total === "number" ? res.data.total : 0)
    } catch (error) {
      setBrowserEntries([])
      setBrowserTotal(0)
      toast.error(error instanceof Error ? error.message : "知识加载失败，请重试")
    } finally {
      setBrowserLoading(false)
    }
  }, [browserPage, browserSearch, browserCategory, browserProject])

  React.useEffect(() => {
    void Promise.resolve().then(fetchBrowserData)
  }, [fetchBrowserData])

  // 搜索输入防抖 300ms
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setBrowserSearch(browserSearchInput)
      setBrowserPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [browserSearchInput])

  // 拉取浏览视图的分类计数（按当前项目）
  React.useEffect(() => {
    const qs = browserProject ? `?projectId=${encodeURIComponent(browserProject)}` : ""
    void fetch(`/api/admin/knowledge/stats${qs}`)
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? json
        setBrowserStats({
          totalEntries: data?.totalEntries ?? 0,
          categoryDistribution: Array.isArray(data?.categoryDistribution) ? data.categoryDistribution : [],
        })
      })
      .catch(() => setBrowserStats(null))
  }, [browserProject])

  const fetchData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchKnowledge({
        page,
        pageSize,
        search,
        category: categoryFilter,
        projectId: projectFilter,
        valueGrade: gradeFilter,
      })
      setEntries(Array.isArray(res.data?.results) ? res.data.results : [])
      setTotal(typeof res.data?.total === "number" ? res.data.total : 0)
    } catch (error) {
      setEntries([])
      setTotal(0)
      toast.error(error instanceof Error ? error.message : "知识列表加载失败，请重试")
    } finally {
      setLoading(false)
    }
  }, [page, search, categoryFilter, projectFilter, gradeFilter])

  React.useEffect(() => {
    void Promise.resolve().then(fetchData)
  }, [fetchData])

  React.useEffect(() => {
    fetchProjects().then((res) => setProjects(Array.isArray(res.data) ? res.data : [])).catch(() => setProjects([]))
  }, [])

  const totalPages = Math.ceil(total / pageSize)
  const visibleEntries = React.useMemo(() => {
    if (!cleanupFilter) return entries
    return entries.filter((entry) => {
      const parsed = parseKnowledgeTags(entry.tags)
      if (cleanupFilter === "ip") return parsed.scope === "ip"
      if (cleanupFilter === "project") return parsed.scope === "project"
      if (cleanupFilter === "pending_verify") return parsed.confidence === "pending_verify"
      if (cleanupFilter === "topic") return parsed.usableFor.includes("topic")
      if (cleanupFilter === "sales") return parsed.usableFor.includes("sales")
      if (cleanupFilter === "uncleaned") return !parsed.isCleaned
      return true
    })
  }, [cleanupFilter, entries])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchData()
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleEntries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleEntries.map((e) => e.id)))
    }
  }

  async function handleSuggestCleanup(entry: KnowledgeEntry) {
    const tags = buildKnowledgeCleaningSuggestion(entry)
    try {
      await batchAction([entry.id], "mergeTags", tags)
      toast.success("已应用清洗建议")
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "应用清洗建议失败，请重试")
    }
  }

  async function handleBatchArchive() {
    if (selectedIds.size === 0) return
    if (!confirm(`确定归档 ${selectedIds.size} 条知识条目？`)) return
    try {
      await batchAction([...selectedIds], "archive")
      toast.success(`已归档 ${selectedIds.size} 条`)
      setSelectedIds(new Set())
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "归档失败，请重试")
    }
  }

  async function handleBatchChangeGrade(grade: string) {
    if (selectedIds.size === 0) return
    try {
      await batchAction([...selectedIds], "changeValueGrade", grade)
      toast.success("已批量修改分级")
      setSelectedIds(new Set())
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量改等级失败，请重试")
    }
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`确定永久删除 ${selectedIds.size} 条知识条目？此操作不可恢复！`)) return
    try {
      await deleteEntries([...selectedIds])
      toast.success(`已删除 ${selectedIds.size} 条`)
      setSelectedIds(new Set())
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请重试")
    }
  }

  async function handleDistill() {
    if (selectedIds.size === 0) return
    setDistilling(true)
    setDistillDialogOpen(true)
    try {
      const res = await distillEntries([...selectedIds])
      setDistillResult(res.data.result)
    } catch (error) {
      setDistillResult(null)
      toast.error(error instanceof Error ? error.message : "知识蒸馏失败，请重试")
    } finally {
      setDistilling(false)
    }
  }

  async function handleAddEntry() {
    if (!editForm.title || !editForm.content) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editForm.title,
          content: editForm.content,
          category: editForm.category,
          tags: editForm.tags ? editForm.tags.split(/[,，、]/).map((t: string) => t.trim()).filter(Boolean) : [],
          sourceType: editForm.sourceType,
          valueGrade: editForm.valueGrade || undefined,
          ...(editForm.projectId !== "none" ? { projectId: editForm.projectId } : {}),
        }),
      })
      if (!res.ok) throw new Error("创建失败")
      setAddDialogOpen(false)
      setEditForm({ title: "", content: "", category: "product_usp", tags: "", sourceType: "manual", projectId: "none", valueGrade: "" })
      toast.success("知识条目已创建")
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadFile() {
    if (!uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", uploadFile)
      formData.append("category", uploadCategory)
      if (uploadProjectId !== "none") formData.append("projectId", uploadProjectId)

      const res = await fetch("/api/admin/knowledge/upload", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) throw new Error("上传失败")
      setUploadDialogOpen(false)
      setUploadFile(null)
      setUploadProjectId("none")
      toast.success("文件已上传")
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败，请重试")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">知识库管理</h1>

      {/* Tab 切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="browser">知识浏览</TabsTrigger>
          <TabsTrigger value="map">知识地图</TabsTrigger>
          <TabsTrigger value="list">条目列表</TabsTrigger>
        </TabsList>

      {/* 知识浏览 Tab（默认）：左树右文，进入即可看具体内容 */}
        <TabsContent value="browser">
          <KnowledgeBrowser
            entries={browserEntries}
            total={browserTotal}
            loading={browserLoading}
            page={browserPage}
            pageSize={browserPageSize}
            projects={projects as unknown as BrowserAdminProject[]}
            stats={browserStats}
            selectedProject={browserProject}
            selectedCategory={browserCategory}
            searchValue={browserSearchInput}
            selectedIds={selectedIds}
            onSelectProject={(value) => {
              setBrowserProject(value)
              setBrowserCategory("")
              setBrowserPage(1)
            }}
            onSelectCategory={(value) => {
              setBrowserCategory(value)
              setBrowserPage(1)
            }}
            onSearchChange={setBrowserSearchInput}
            onPageChange={setBrowserPage}
            onToggleSelect={toggleSelect}
            onOpenDetail={setDetailEntry}
            onManualAdd={() => {
              setEditForm((f) => ({ ...f, projectId: browserProject === "unbound" ? "none" : browserProject || "none" }))
              setAddDialogOpen(true)
            }}
            onUpload={() => {
              setUploadProjectId(browserProject === "unbound" ? "none" : browserProject || "none")
              setUploadDialogOpen(true)
            }}
            onSmartImport={() => {
              setSmartImportProjectId(browserProject === "unbound" ? "none" : browserProject || "none")
              setSmartImportOpen(true)
            }}
          />
        </TabsContent>

      {/* 知识地图 Tab */}
        <TabsContent value="map">
          <KnowledgeMap
            projects={projects}
            onDrillDown={(filters) => {
              if (filters.category) {
                setBrowserCategory(filters.category)
                setBrowserPage(1)
                setActiveTab("browser")
              }
            }}
          />
        </TabsContent>

      <KnowledgeListTab
        entries={visibleEntries}
        loading={loading}
        search={search}
        categoryFilter={categoryFilter}
        projectFilter={projectFilter}
        cleanupFilter={cleanupFilter}
        gradeFilter={gradeFilter}
        projects={projects}
        selectedIds={selectedIds}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onSearch={handleSearch}
        onSearchChange={setSearch}
        onCategoryChange={(value) => {
          setCategoryFilter(value)
          setPage(1)
        }}
        onProjectChange={(value) => {
          setProjectFilter(value)
          setPage(1)
        }}
        onCleanupChange={(value) => {
          setCleanupFilter(value)
          setSelectedIds(new Set())
        }}
        onGradeChange={(value) => {
          setGradeFilter(value)
          setPage(1)
        }}
        onOpenAdd={() => setAddDialogOpen(true)}
        onOpenUpload={() => setUploadDialogOpen(true)}
        onOpenSmartImport={() => setSmartImportOpen(true)}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onOpenDetail={setDetailEntry}
        onSuggestCleanup={handleSuggestCleanup}
        onDistill={handleDistill}
        onBatchChangeGrade={handleBatchChangeGrade}
        onBatchArchive={handleBatchArchive}
        onBatchDelete={handleBatchDelete}
        onPageChange={setPage}
      />
      </Tabs>

      <KnowledgeDetailDialog entry={detailEntry} onClose={() => setDetailEntry(null)} />
      <KnowledgeDistillDialog
        open={distillDialogOpen}
        loading={distilling}
        result={distillResult}
        onOpenChange={setDistillDialogOpen}
      />

      <KnowledgeEntryDialog
        open={addDialogOpen}
        form={editForm}
        projects={projects}
        saving={saving}
        onOpenChange={setAddDialogOpen}
        onFormChange={setEditForm}
        onSave={handleAddEntry}
      />
      <KnowledgeUploadDialog
        open={uploadDialogOpen}
        file={uploadFile}
        category={uploadCategory}
        projectId={uploadProjectId}
        projects={projects}
        uploading={uploading}
        onOpenChange={setUploadDialogOpen}
        onFileChange={setUploadFile}
        onCategoryChange={setUploadCategory}
        onProjectChange={setUploadProjectId}
        onUpload={handleUploadFile}
      />

      <SmartImportDialog
        open={smartImportOpen}
        projectId={smartImportProjectId}
        projects={projects}
        onOpenChange={setSmartImportOpen}
        onProjectChange={setSmartImportProjectId}
        onImported={fetchData}
      />
    </div>
  )
}
