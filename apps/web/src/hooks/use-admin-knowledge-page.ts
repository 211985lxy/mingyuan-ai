"use client"

import React from "react"
import { toast } from "sonner"

import { buildKnowledgeCleaningSuggestion, parseKnowledgeTags } from "@/lib/knowledge-tags"
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
import { useAdminKnowledgeBrowser } from "@/hooks/use-admin-knowledge-browser"

const EMPTY_EDIT_FORM = {
  title: "",
  content: "",
  category: "product_usp",
  tags: "",
  sourceType: "manual" as string,
  projectId: "none",
  valueGrade: "" as string,
}

/**
 * 管理端知识库页：列表筛选、批量操作、录入/上传对话框状态。
 */
export function useAdminKnowledgePage() {
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

  const [projects, setProjects] = React.useState<AdminProject[]>([])
  const [activeTab, setActiveTab] = React.useState("browser")
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [detailEntry, setDetailEntry] = React.useState<KnowledgeEntry | null>(null)

  const [distillDialogOpen, setDistillDialogOpen] = React.useState(false)
  const [distillResult, setDistillResult] = React.useState<DistillResult | null>(null)
  const [distilling, setDistilling] = React.useState(false)

  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [editForm, setEditForm] = React.useState(EMPTY_EDIT_FORM)
  const [saving, setSaving] = React.useState(false)

  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [uploadFile, setUploadFile] = React.useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = React.useState("product_usp")
  const [uploadProjectId, setUploadProjectId] = React.useState("none")
  const [uploading, setUploading] = React.useState(false)

  const [smartImportOpen, setSmartImportOpen] = React.useState(false)
  const [smartImportProjectId, setSmartImportProjectId] = React.useState("none")

  const browser = useAdminKnowledgeBrowser()

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
    fetchProjects()
      .then((res) => setProjects(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProjects([]))
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
    void fetchData()
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
      void fetchData()
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
      void fetchData()
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
      void fetchData()
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
      void fetchData()
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          content: editForm.content,
          category: editForm.category,
          tags: editForm.tags
            ? editForm.tags.split(/[,，、]/).map((t: string) => t.trim()).filter(Boolean)
            : [],
          sourceType: editForm.sourceType,
          valueGrade: editForm.valueGrade || undefined,
          ...(editForm.projectId !== "none" ? { projectId: editForm.projectId } : {}),
        }),
      })
      if (!res.ok) throw new Error("创建失败")
      setAddDialogOpen(false)
      setEditForm(EMPTY_EDIT_FORM)
      toast.success("知识条目已创建")
      void fetchData()
      void browser.fetchBrowserData()
      browser.bumpHealth()
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
      void fetchData()
      void browser.fetchBrowserData()
      browser.bumpHealth()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败，请重试")
    } finally {
      setUploading(false)
    }
  }

  function openAddForBrowser(projectId?: string) {
    const pid = projectId === "unbound" || !projectId ? "none" : projectId
    setEditForm((f) => ({ ...f, projectId: pid }))
    setAddDialogOpen(true)
  }

  function openUploadForBrowser(projectId?: string) {
    setUploadProjectId(projectId === "unbound" || !projectId ? "none" : projectId)
    setUploadDialogOpen(true)
  }

  function openSmartImportForBrowser(projectId?: string) {
    setSmartImportProjectId(projectId === "unbound" || !projectId ? "none" : projectId)
    setSmartImportOpen(true)
  }

  function openSupplement({ category }: { category: string }) {
    browser.setBrowserCategory(category)
    browser.setBrowserPage(1)
    setEditForm((f) => ({
      ...f,
      category,
      projectId: browser.browserProject === "unbound" ? "none" : browser.browserProject || "none",
      title: "",
      content: "",
      tags: "",
      sourceType: "manual",
      valueGrade: "",
    }))
    setAddDialogOpen(true)
  }

  return {
    ...browser,
    entries: visibleEntries,
    total,
    page,
    setPage,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    projectFilter,
    setProjectFilter,
    cleanupFilter,
    setCleanupFilter,
    gradeFilter,
    setGradeFilter,
    loading,
    pageSize,
    totalPages,
    projects,
    activeTab,
    setActiveTab,
    selectedIds,
    setSelectedIds,
    detailEntry,
    setDetailEntry,
    distillDialogOpen,
    setDistillDialogOpen,
    distillResult,
    distilling,
    addDialogOpen,
    setAddDialogOpen,
    editForm,
    setEditForm,
    saving,
    uploadDialogOpen,
    setUploadDialogOpen,
    uploadFile,
    setUploadFile,
    uploadCategory,
    setUploadCategory,
    uploadProjectId,
    setUploadProjectId,
    uploading,
    smartImportOpen,
    setSmartImportOpen,
    smartImportProjectId,
    setSmartImportProjectId,
    fetchData,
    handleSearch,
    toggleSelect,
    toggleSelectAll,
    handleSuggestCleanup,
    handleBatchArchive,
    handleBatchChangeGrade,
    handleBatchDelete,
    handleDistill,
    handleAddEntry,
    handleUploadFile,
    openAddForBrowser,
    openUploadForBrowser,
    openSmartImportForBrowser,
    openSupplement,
  }
}
