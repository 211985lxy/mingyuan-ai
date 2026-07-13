"use client"

import React from "react"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Archive,
  Trash2,
  Upload,
  Plus,
  Eye,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  KnowledgeDetailDialog,
  KnowledgeDistillDialog,
} from "@/features/knowledge/components/knowledge-review-dialogs"
import {
  KnowledgeEntryDialog,
  KnowledgeUploadDialog,
} from "@/features/knowledge/components/knowledge-entry-dialogs"
import {
  CATEGORY_LABELS,
  JIEKOU_PROVIDER_MODELS,
  KNOWLEDGE_UPLOAD_ACCEPT,
  SOURCE_TYPE_LABELS,
  batchAction,
  deleteEntries,
  distillEntries,
  embeddingLabel,
  fetchKnowledge,
  fetchProjects,
  getAdminToken,
  projectLabel,
  type AdminProject,
  type DistillResult,
  type KnowledgeEntry,
} from "@/features/knowledge/admin-knowledge-shared"

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
  const [smartImportStep, setSmartImportStep] = React.useState<"upload" | "processing" | "preview">("upload")
  const [smartImportFiles, setSmartImportFiles] = React.useState<File[]>([])
  const [smartImportProjectId, setSmartImportProjectId] = React.useState("none")
  const [smartImportPreviewData, setSmartImportPreviewData] = React.useState<{
    userId: string
    projectId: string | null
    processed: Array<{
      index: number
      originalText: string
      detectedSource: string
      suggestedTitle: string
      suggestedKeyPoints: string
      suggestedCategory: string
      suggestedTags: string[]
      suggestedValueGrade: string
      duplicateOfId?: string
      duplicateScore?: number
      confidence: string
    }>
    fileNames: string[]
  } | null>(null)
  const [smartImportConfirming, setSmartImportConfirming] = React.useState(false)
  const [smartImportEdits, setSmartImportEdits] = React.useState<Record<number, {
    title?: string
    category?: string
    tags?: string[]
    valueGrade?: string
    skip?: boolean
  }>>({})
  const [smartImportExpanded, setSmartImportExpanded] = React.useState<Set<number>>(new Set())

  // 中转站测试
  const [jiekouTestOpen, setJiekouTestOpen] = React.useState(false)
  const [jiekouProvider, setJiekouProvider] = React.useState<"jiekou" | "openrouter">("jiekou")
  const [jiekouPrompt, setJiekouPrompt] = React.useState("")
  const [jiekouModel, setJiekouModel] = React.useState("gpt-4o")
  const [jiekouTemperature, setJiekouTemperature] = React.useState(0.7)
  const [jiekouMaxTokens, setJiekouMaxTokens] = React.useState(4000)
  const [jiekouResult, setJiekouResult] = React.useState("")
  const [jiekouLoading, setJiekouLoading] = React.useState(false)
  const [jiekouStreamEnabled, setJiekouStreamEnabled] = React.useState(true)

  const jiekouModelOptions = JIEKOU_PROVIDER_MODELS[jiekouProvider] || []

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

  async function handleSmartImportAnalyze() {
    if (smartImportFiles.length === 0) return
    setSmartImportStep("processing")
    setSmartImportEdits({})
    setSmartImportPreviewData(null)
    try {
      const formData = new FormData()
      for (const file of smartImportFiles) formData.append("files", file)
      if (smartImportProjectId !== "none") formData.append("projectId", smartImportProjectId)

      const res = await fetch("/api/admin/knowledge/smart-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "分析失败" }))
        throw new Error(err.error || "智能分析失败")
      }
      const data = await res.json()
      setSmartImportPreviewData(data.data)
      setSmartImportStep("preview")
    } catch (error) {
      toast.error(`智能分析失败：${error instanceof Error ? error.message : "未知错误"}`)
      setSmartImportStep("upload")
    }
  }

  async function handleSmartImportConfirm() {
    if (!smartImportPreviewData) return
    setSmartImportConfirming(true)
    try {
      const entries = (Array.isArray(smartImportPreviewData.processed) ? smartImportPreviewData.processed : [])
        .filter((r) => !(smartImportEdits[r.index]?.skip))
        .map((r) => {
          const edit = smartImportEdits[r.index]
          return {
            title: edit?.title || r.suggestedTitle,
            content: r.originalText,
            category: edit?.category || r.suggestedCategory,
            tags: edit?.tags || r.suggestedTags,
            valueGrade: edit?.valueGrade || r.suggestedValueGrade,
          }
        })

      const res = await fetch("/api/admin/knowledge/smart-import/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          userId: smartImportPreviewData.userId,
          projectId: smartImportPreviewData.projectId,
          entries,
        }),
      })
      if (!res.ok) throw new Error("确认导入失败")
      await res.json().catch(() => null)
      setSmartImportOpen(false)
      setSmartImportStep("upload")
      setSmartImportFiles([])
      setSmartImportPreviewData(null)
      setSmartImportEdits({})
      toast.success(`已导入 ${entries.length} 条知识`)
      fetchData()
    } catch (error) {
      toast.error(`导入失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setSmartImportConfirming(false)
    }
  }

  async function handleJiekouTest() {
    if (!jiekouPrompt.trim()) return
    setJiekouLoading(true)
    setJiekouResult("")

    try {
      const token = getAdminToken()
      const response = await fetch("/api/admin/jiekou/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: jiekouProvider,
          messages: [{ role: "user", content: jiekouPrompt }],
          model: jiekouModel,
          temperature: jiekouTemperature,
          max_tokens: jiekouMaxTokens,
          stream: jiekouStreamEnabled,
        }),
      })

      if (!response.ok) {
        // 上游可能返回非 JSON（如 502 HTML 网关页），解析失败时回退到通用提示
        const error = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(error.error || "测试失败")
      }

      if (jiekouStreamEnabled) {
        // 流式输出
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) throw new Error("无法读取响应流")

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.content) {
                  setJiekouResult((prev) => prev + parsed.content)
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      } else {
        // 常规输出
        const data = await response.json()
        setJiekouResult(data.content || "")
      }
    } catch (error) {
      setJiekouResult(`错误: ${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setJiekouLoading(false)
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
      {/* 中转站测试面板（内部使用，客户不可见） */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setJiekouTestOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              中转站测试（内部）
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {jiekouTestOpen ? "收起 ▲" : "展开 ▼"}
            </span>
          </div>
        </CardHeader>
        {jiekouTestOpen && (
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              切换通道测试不同模型：JieKou（接口AI）或 OpenRouter（含免费模型，每天 200 次）。默认 gpt-4o，支持流式输出。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">通道</Label>
                <Select
                  value={jiekouProvider}
                  onValueChange={(v) => {
                    const p = (v === "openrouter" ? "openrouter" : "jiekou") as "jiekou" | "openrouter"
                    setJiekouProvider(p)
                    // 切换通道时重置为该通道第一个模型
                    const first = JIEKOU_PROVIDER_MODELS[p]?.[0]
                    if (first) setJiekouModel(first.value)
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jiekou">JieKou（接口AI · gpt/deepseek）</SelectItem>
                    <SelectItem value="openrouter">OpenRouter（含免费模型）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">模型</Label>
                <Select value={jiekouModel} onValueChange={(v) => setJiekouModel(v ?? jiekouModel)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jiekouModelOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Temperature（{jiekouTemperature}）</Label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={jiekouTemperature}
                  onChange={(e) => setJiekouTemperature(Number(e.target.value))}
                  className="w-full h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Tokens</Label>
                <Input
                  type="number"
                  value={jiekouMaxTokens}
                  onChange={(e) => setJiekouMaxTokens(Number(e.target.value))}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">测试提示词</Label>
              <Textarea
                value={jiekouPrompt}
                onChange={(e) => setJiekouPrompt(e.target.value)}
                placeholder="输入测试内容，例如：你好，请用一句话介绍你自己。"
                rows={3}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={jiekouStreamEnabled}
                  onChange={(e) => setJiekouStreamEnabled(e.target.checked)}
                  className="cursor-pointer"
                />
                流式输出
              </label>
              <div className="flex-1" />
              <Button
                onClick={handleJiekouTest}
                disabled={jiekouLoading || !jiekouPrompt.trim()}
                className="cursor-pointer"
              >
                {jiekouLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    调用中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    测试调用
                  </>
                )}
              </Button>
            </div>

            {(jiekouResult || jiekouLoading) && (
              <div className="space-y-1.5">
                <Label className="text-xs">返回结果</Label>
                <div className="min-h-20 rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {jiekouResult || (
                    <span className="text-muted-foreground">等待返回...</span>
                  )}
                  {jiekouLoading && jiekouResult && (
                    <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse" />
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

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

      {/* 智能导入 Dialog */}
      <Dialog open={smartImportOpen} onOpenChange={(open) => { if (!open) { setSmartImportStep("upload"); setSmartImportFiles([]); setSmartImportPreviewData(null); setSmartImportEdits({}) } setSmartImportOpen(open) }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              智能导入
            </DialogTitle>
            <DialogDescription>上传文件，系统自动分类、打标签、去重</DialogDescription>
          </DialogHeader>

          {/* Step 1: Upload */}
          {smartImportStep === "upload" && (
            <div className="space-y-4">
              <div>
                <Label>归属项目</Label>
                <Select value={smartImportProjectId} onValueChange={(v) => setSmartImportProjectId(v ?? "none")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">全局方法论 / 不绑定项目</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>{projectLabel(project)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>选择文件（支持 PDF/Word/PPT/Excel/HTML/TXT/MD/CSV/JSON/XML/RTF）</Label>
                <div className="mt-1">
                  <Input
                    type="file"
                    accept={KNOWLEDGE_UPLOAD_ACCEPT}
                    multiple
                    onChange={(e) => setSmartImportFiles(Array.from(e.target.files ?? []))}
                    className="cursor-pointer"
                  />
                </div>
              </div>
              {smartImportFiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">已选 {smartImportFiles.length} 个文件：</p>
                  <div className="flex flex-wrap gap-2">
                    {smartImportFiles.map((f, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {f.name} ({(f.size / 1024).toFixed(1)}KB)
                        <button className="ml-1 hover:text-destructive" onClick={() => setSmartImportFiles((prev) => prev.filter((_, j) => j !== i))}>×</button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSmartImportOpen(false)} className="cursor-pointer">取消</Button>
                <Button onClick={handleSmartImportAnalyze} disabled={smartImportFiles.length === 0} className="cursor-pointer">
                  <Sparkles className="h-4 w-4 mr-1" />
                  开始智能分析
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Processing */}
          {smartImportStep === "processing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在智能分析文件内容…</p>
              <div className="text-xs text-muted-foreground space-y-1">
                {smartImportFiles.map((f) => (
                  <p key={f.name}>{f.name}</p>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Preview + Confirm */}
          {smartImportStep === "preview" && smartImportPreviewData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                共 {(Array.isArray(smartImportPreviewData.processed) ? smartImportPreviewData.processed : []).length} 条知识待确认，可编辑标题/分类/分级，勾选跳过重复条目
              </p>
              <div className="space-y-3">
                {(Array.isArray(smartImportPreviewData.processed) ? smartImportPreviewData.processed : []).map((item) => {
                  const edit = smartImportEdits[item.index] ?? {}
                  const isDuplicate = !!item.duplicateOfId
                  const isExpanded = smartImportExpanded.has(item.index)
                  return (
                    <Card key={item.index} className={`border ${edit.skip ? "opacity-50" : isDuplicate ? "border-orange-200" : ""}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">#{item.index + 1}</span>
                            {item.detectedSource === "wechat_chat" && (
                              <Badge variant="outline" className="text-[10px]">微信记录</Badge>
                            )}
                            <Badge variant={item.confidence === "high" ? "default" : item.confidence === "medium" ? "secondary" : "outline"} className="text-[10px]">
                              {item.confidence === "high" ? "高置信" : item.confidence === "medium" ? "中置信" : "低置信"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isDuplicate && (
                              <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">
                                重复 {(item.duplicateScore! * 100).toFixed(0)}%
                              </Badge>
                            )}
                            <label className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!edit.skip}
                                onChange={(e) => setSmartImportEdits((prev) => ({ ...prev, [item.index]: { ...prev[item.index], skip: e.target.checked } }))}
                              />
                              跳过
                            </label>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">标题</Label>
                            <Input
                              value={edit.title ?? item.suggestedTitle}
                              onChange={(e) => setSmartImportEdits((prev) => ({ ...prev, [item.index]: { ...prev[item.index], title: e.target.value } }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">分类</Label>
                            <Select
                              value={edit.category ?? item.suggestedCategory}
                              onValueChange={(v) => setSmartImportEdits((prev) => ({ ...prev, [item.index]: { ...prev[item.index], category: v ?? "" } }))}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                                  <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">价值分级</Label>
                            <Select
                              value={edit.valueGrade ?? item.suggestedValueGrade}
                              onValueChange={(v) => setSmartImportEdits((prev) => ({ ...prev, [item.index]: { ...prev[item.index], valueGrade: v ?? "" } }))}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="S">S · 战略级</SelectItem>
                                <SelectItem value="A">A · 战术级</SelectItem>
                                <SelectItem value="B">B · 参考级</SelectItem>
                                <SelectItem value="C">C · 索引级</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(edit.tags ?? item.suggestedTags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">{tag.replace("kb_scope:", "").replace("asset_role:", "").replace("usable_for:", "").replace("confidence:", "")}</Badge>
                          ))}
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-2">{edit.skip ? "(已跳过)" : item.suggestedKeyPoints}</p>

                        <button
                          className="text-[10px] text-primary hover:underline cursor-pointer"
                          onClick={() => setSmartImportExpanded((prev) => {
                            const next = new Set(prev)
                            if (next.has(item.index)) next.delete(item.index)
                            else next.add(item.index)
                            return next
                          })}
                        >
                          {isExpanded ? "收起原文" : "展开原文"}
                        </button>
                        {isExpanded && (
                          <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{item.originalText}</pre>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm text-muted-foreground">
                  将导入 {(Array.isArray(smartImportPreviewData.processed) ? smartImportPreviewData.processed : []).filter((r) => !smartImportEdits[r.index]?.skip).length} 条
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSmartImportStep("upload")} className="cursor-pointer">
                    重新选择
                  </Button>
                  <Button
                    onClick={handleSmartImportConfirm}
                    disabled={smartImportConfirming || (Array.isArray(smartImportPreviewData.processed) ? smartImportPreviewData.processed : []).every((r) => smartImportEdits[r.index]?.skip)}
                    className="cursor-pointer"
                  >
                    {smartImportConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    确认导入
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
