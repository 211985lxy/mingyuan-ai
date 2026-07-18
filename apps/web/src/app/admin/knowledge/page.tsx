"use client"

import React from "react"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Archive,
  Trash2,
  Upload,
  Plus,
  Eye,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  buildKnowledgeCleaningSuggestion,
  knowledgeCleanupLabel,
  parseKnowledgeTags,
} from "@/lib/knowledge-tags"
import { KnowledgeMap } from "@/components/admin/knowledge-map"
import {
  KnowledgeBrowser,
  type KnowledgeEntry as BrowserKnowledgeEntry,
  type AdminProject as BrowserAdminProject,
} from "@/components/admin/knowledge-browser"
import { InternalModelTestPanel } from "@/components/admin/internal-model-test-panel"
import { SmartImportDialog } from "@/components/admin/knowledge/smart-import-dialog"
import {
  KnowledgeAddDialog,
  KnowledgeDetailDialog,
  KnowledgeDistillDialog,
  KnowledgeUploadDialog,
} from "@/components/admin/knowledge/knowledge-dialogs"

// ─── 类型定义 ──────────────────────────────────────────────

interface KnowledgeEntry {
  id: string
  userId: string
  projectId?: string | null
  category: string
  title: string
  content: string
  tags: string[]
  sourceType: string
  valueGrade?: string | null
  status: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string }
  project?: { id: string; name: string; companyName: string | null; industry: string | null; status: string } | null
  embedding?: { status: string; updatedAt: string; errorMessage: string | null } | null
}

interface AdminProject {
  id: string
  name: string
  companyName: string | null
  industry: string | null
  status: string
  knowledgeCount?: number
  user: { id: string; name: string | null; email: string }
}

interface DistillResult {
  distilled: Array<{
    index: number
    suggestedTitle: string
    suggestedContent: string
    suggestedCategory: string
    tags: string[]
    action: "keep" | "merge" | "archive"
  }>
  duplicates: number[][]
  suggestions: string
}

// ─── 常量 ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  boss_experience: "老板经验",
  product_usp: "产品卖点",
  customer_pain: "客户痛点",
  project_case: "项目案例",
  customer_qa: "客户问答",
  daily_inspiration: "日常灵感",
  benchmark_reference: "竞品/对标参考",
  user_insight: "用户洞察",
  hot_topic: "热点素材",
  positioning_material: "定位素材",
  private_domain_material: "私域素材",
  writing_style_profile: "写作风格档案",
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual: "手动录入",
  voice_transcribe: "语音转写",
  import: "文件导入",
  obsidian: "Obsidian 同步",
  smart_import: "智能导入",
}

// ─── API 调用 ──────────────────────────────────────────────

function getAdminToken(): string {
  if (typeof window === "undefined") return ""
  try {
    const authStr = localStorage.getItem("mingyuan-admin-auth")
    if (!authStr) return ""
    const authObj = JSON.parse(authStr)
    return authObj.state?.token || ""
  } catch {
    return ""
  }
}

async function fetchKnowledge(params: {
  page?: number
  pageSize?: number
  search?: string
  category?: string
  userId?: string
  sourceType?: string
  projectId?: string
  valueGrade?: string
}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set("page", String(params.page))
  if (params.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params.search) qs.set("search", params.search)
  if (params.category) qs.set("category", params.category)
  if (params.userId) qs.set("userId", params.userId)
  if (params.sourceType) qs.set("sourceType", params.sourceType)
  if (params.projectId) qs.set("projectId", params.projectId)
  if (params.valueGrade) qs.set("valueGrade", params.valueGrade)
  
  const token = getAdminToken()
  const res = await fetch(`/api/admin/knowledge?${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return res.json() as Promise<{
    data: { results: KnowledgeEntry[]; total: number; page: number; pageSize: number }
  }>
}

async function fetchProjects() {
  const token = getAdminToken()
  const res = await fetch("/api/admin/projects", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return res.json() as Promise<{ data: AdminProject[] }>
}

function projectLabel(project: AdminProject) {
  const count = typeof project.knowledgeCount === "number" ? ` · ${project.knowledgeCount}条资料` : ""
  return `${project.name}${project.companyName ? ` · ${project.companyName}` : ""}${count}`
}

function embeddingLabel(entry: KnowledgeEntry) {
  if (entry.embedding?.status === "completed") return "已向量化"
  if (entry.embedding?.status === "failed") return "失败"
  return "未生成"
}

async function batchAction(
  ids: string[],
  action: string,
  value?: string | string[]
) {
  const token = getAdminToken()
  const res = await fetch("/api/admin/knowledge", {
    method: "PUT",
    headers: { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids, action, value }),
  })
  if (!res.ok) throw new Error("操作失败")
  return res.json().catch(() => ({ success: true }))
}

async function deleteEntries(ids: string[]) {
  const token = getAdminToken()
  const res = await fetch(`/api/admin/knowledge?ids=${ids.join(",")}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new Error("删除失败")
  return res.json().catch(() => ({ success: true }))
}

async function distillEntries(ids: string[]) {
  const token = getAdminToken()
  const res = await fetch("/api/admin/knowledge/distill", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error("蒸馏失败")
  return res.json() as Promise<{ data: { entryCount: number; result: DistillResult } }>
}

// ─── 页面 ──────────────────────────────────────────────────

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
    const token = getAdminToken()
    const qs = browserProject ? `?projectId=${encodeURIComponent(browserProject)}` : ""
    void fetch(`/api/admin/knowledge/stats${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
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
      const token = getAdminToken()
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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

      const token = getAdminToken()
      const res = await fetch("/api/admin/knowledge/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

      {/* 条目列表 Tab */}
        <TabsContent value="list">
      <InternalModelTestPanel getToken={getAdminToken} />

      {/* 操作栏 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索标题或内容..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" className="cursor-pointer">
              搜索
            </Button>
          </form>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            className="cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1" />
            手动录入
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUploadDialogOpen(true)}
            className="cursor-pointer"
          >
            <Upload className="h-4 w-4 mr-1" />
            上传文件
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSmartImportOpen(true)}
            className="cursor-pointer"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            智能导入
          </Button>
          <Select
            value={categoryFilter || "all"}
            onValueChange={(v) => {
              setCategoryFilter(v === "all" ? "" : (v ?? ""))
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={projectFilter || "all"}
            onValueChange={(v) => {
              setProjectFilter(v === "all" ? "" : (v ?? ""))
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="全部项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              <SelectItem value="unbound">未绑定项目</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {projectLabel(project)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={cleanupFilter || "all"}
            onValueChange={(v) => {
              setCleanupFilter(v === "all" ? "" : (v ?? ""))
              setSelectedIds(new Set())
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="清洗状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部清洗状态</SelectItem>
              <SelectItem value="ip">IP资产</SelectItem>
              <SelectItem value="project">项目资产</SelectItem>
              <SelectItem value="pending_verify">待核验</SelectItem>
              <SelectItem value="topic">可用于选题</SelectItem>
              <SelectItem value="sales">可用于成交</SelectItem>
              <SelectItem value="uncleaned">未清洗</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={gradeFilter || "all"}
            onValueChange={(v) => {
              setGradeFilter(v === "all" ? "" : (v ?? ""))
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="价值分级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分级</SelectItem>
              <SelectItem value="S">S · 战略级</SelectItem>
              <SelectItem value="A">A · 战术级</SelectItem>
              <SelectItem value="B">B · 参考级</SelectItem>
              <SelectItem value="C">C · 索引级</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 批量操作 */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">
              已选 {selectedIds.size} 条
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDistill}
              className="cursor-pointer"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              知识蒸馏
            </Button>
            <Select onValueChange={(v) => handleBatchChangeGrade(typeof v === "string" ? v : "")}>
              <SelectTrigger className="w-[150px] h-8">
                <SelectValue placeholder="改分级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="S">S · 战略级</SelectItem>
                <SelectItem value="A">A · 战术级</SelectItem>
                <SelectItem value="B">B · 参考级</SelectItem>
                <SelectItem value="C">C · 索引级</SelectItem>
                <SelectItem value="">清除分级</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchArchive}
              className="cursor-pointer"
            >
              <Archive className="h-4 w-4 mr-1" />
              归档
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBatchDelete}
              className="cursor-pointer"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </div>
        )}
      </div>

      {/* 表格 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 p-3 text-left">
                    <input
                      type="checkbox"
                      checked={visibleEntries.length > 0 && selectedIds.size === visibleEntries.length}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="text-left p-3 font-medium">标题</th>
                  <th className="text-left p-3 font-medium hidden xl:table-cell">项目</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">用户</th>
                  <th className="text-left p-3 font-medium">分类</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">来源</th>
                  <th className="text-left p-3 font-medium">状态</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">向量</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">更新</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-3" colSpan={9}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : visibleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      暂无知识库条目
                    </td>
                  </tr>
                ) : (
                  visibleEntries.map((entry) => {
                    const cleanup = parseKnowledgeTags(entry.tags)
                    return (
                      <tr
                        key={entry.id}
                        className={`border-b hover:bg-muted/30 transition-colors ${
                          selectedIds.has(entry.id) ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(entry.id)}
                            onChange={() => toggleSelect(entry.id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="p-3 max-w-[260px]">
                          <button
                            type="button"
                            onClick={() => setDetailEntry(entry)}
                            className="flex max-w-full items-center gap-1 truncate text-left font-medium hover:text-primary"
                          >
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{entry.title}</span>
                          </button>
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            {entry.content.slice(0, 80)}...
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {entry.valueGrade && ["S", "A", "B", "C"].includes(entry.valueGrade) && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  entry.valueGrade === "S"
                                    ? "border-amber-400 text-amber-700 bg-amber-50"
                                    : entry.valueGrade === "A"
                                    ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                    : entry.valueGrade === "C"
                                    ? "border-gray-400 text-gray-600 bg-gray-50"
                                    : "border-indigo-500 text-indigo-700 bg-indigo-50"
                                }`}
                              >
                                {entry.valueGrade}
                              </Badge>
                            )}
                            <Badge variant={cleanup.isCleaned ? "outline" : "secondary"} className="text-[10px]">
                              {knowledgeCleanupLabel(cleanup)}
                            </Badge>
                            {cleanup.assetRole ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {cleanup.assetRole}
                              </Badge>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px]"
                              onClick={() => handleSuggestCleanup(entry)}
                            >
                              清洗建议
                            </Button>
                          </div>
                        </td>
                      <td className="p-3 hidden xl:table-cell text-muted-foreground text-xs">
                        {entry.project ? (
                          <>
                            <p className="max-w-[180px] truncate text-foreground">{entry.project.name}</p>
                            <p className="max-w-[180px] truncate">
                              {entry.project.companyName || entry.project.industry || "项目知识"}
                            </p>
                          </>
                        ) : (
                          "全局/未绑定"
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                        {entry.user?.name ?? entry.user?.email ?? "未知"}
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORY_LABELS[entry.category] || entry.category}
                        </Badge>
                      </td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">
                        {SOURCE_TYPE_LABELS[entry.sourceType] || entry.sourceType}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={entry.status === "active" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {entry.status === "active" ? "生效" : "已归档"}
                        </Badge>
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <Badge
                          variant={entry.embedding?.status === "completed" ? "default" : entry.embedding?.status === "failed" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {embeddingLabel(entry)}
                        </Badge>
                      </td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                        {new Date(entry.updatedAt).toLocaleDateString("zh-CN")}
                      </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}，共 {total} 条
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
        </TabsContent>
      </Tabs>

      <KnowledgeDetailDialog entry={detailEntry} categories={CATEGORY_LABELS} sources={SOURCE_TYPE_LABELS} onClose={() => setDetailEntry(null)} />
      <KnowledgeDistillDialog open={distillDialogOpen} loading={distilling} result={distillResult} onOpenChange={setDistillDialogOpen} />
      <KnowledgeAddDialog
        open={addDialogOpen} form={editForm} saving={saving} categories={CATEGORY_LABELS}
        projects={projects.map((project) => ({ id: project.id, label: projectLabel(project) }))}
        onOpenChange={setAddDialogOpen} onChange={(patch) => setEditForm((form) => ({ ...form, ...patch }))} onSave={handleAddEntry}
      />
      <KnowledgeUploadDialog
        open={uploadDialogOpen} file={uploadFile} category={uploadCategory} projectId={uploadProjectId} uploading={uploading}
        categories={CATEGORY_LABELS} projects={projects.map((project) => ({ id: project.id, label: projectLabel(project) }))}
        onOpenChange={setUploadDialogOpen} onFileChange={setUploadFile} onCategoryChange={setUploadCategory}
        onProjectChange={setUploadProjectId} onUpload={handleUploadFile}
      />

      {/* 智能导入 Dialog */}
      <SmartImportDialog
        key={smartImportProjectId}
        open={smartImportOpen}
        defaultProjectId={smartImportProjectId}
        projects={projects.map((project) => ({ id: project.id, label: projectLabel(project) }))}
        categories={CATEGORY_LABELS}
        getToken={getAdminToken}
        onOpenChange={setSmartImportOpen}
        onImported={fetchData}
      />
    </div>
  )
}
