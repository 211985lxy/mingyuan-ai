"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, Loader2, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import {
  ApiError,
  archiveKnowledge,
  createKnowledge,
  listClientProjects,
  listKnowledge,
  updateKnowledge,
  type ClientProject,
  type KnowledgeEntry,
} from "@/lib/api/client"
import { CATEGORY_LABELS, KNOWLEDGE_CATEGORIES, PROJECT_REQUIRED_CATEGORIES } from "@/lib/knowledge-categories"
import {
  CustomerKnowledgeEntryDialog,
  EMPTY_CUSTOMER_KNOWLEDGE_FORM,
  type CustomerKnowledgeForm,
} from "@/features/knowledge/components/customer-knowledge-entry-dialog"

function parseTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function CustomerKnowledgeWorkspace() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState("")
  const [projectFilter, setProjectFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CustomerKnowledgeForm>(EMPTY_CUSTOMER_KNOWLEDGE_FORM)
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) map.set(project.id, project.name)
    return map
  }, [projects])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextEntries, nextProjects] = await Promise.all([
        listKnowledge({
          status: statusFilter,
          ...(projectFilter !== "all" ? { projectId: projectFilter } : {}),
          ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
        }),
        listClientProjects("active"),
      ])
      setEntries(nextEntries)
      setProjects(nextProjects)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoadError(null)
        return
      }
      setLoadError(error instanceof Error ? error.message : "知识库读取失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, projectFilter, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  // 关键词仅过滤当前已加载页，不是全库搜索
  const visibleEntries = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) => {
      const haystack = `${entry.title}\n${entry.content}\n${entry.tags.join(" ")}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [entries, keyword])

  function openCreate() {
    setDialogMode("create")
    setEditingId(null)
    setForm({
      ...EMPTY_CUSTOMER_KNOWLEDGE_FORM,
      projectId: projectFilter !== "all" ? projectFilter : "none",
    })
    setDialogOpen(true)
  }

  function openEdit(entry: KnowledgeEntry) {
    setDialogMode("edit")
    setEditingId(entry.id)
    setForm({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      tags: entry.tags.join(", "),
      projectId: entry.projectId || "none",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) {
      toast.error("请填写标题和内容")
      return
    }
    if (PROJECT_REQUIRED_CATEGORIES.has(form.category) && form.projectId === "none") {
      toast.error("这个分类需要选择所属项目")
      return
    }

    setSaving(true)
    try {
      const payload = {
        title,
        content,
        category: form.category,
        tags: parseTags(form.tags),
        projectId: form.projectId === "none" ? null : form.projectId,
      }
      if (dialogMode === "create") {
        await createKnowledge({
          ...payload,
          projectId: payload.projectId ?? undefined,
          sourceType: "manual",
        })
        toast.success("已新增知识")
      } else if (editingId) {
        await updateKnowledge(editingId, payload)
        toast.success("已更新知识")
      }
      setDialogOpen(false)
      await load()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast.error(error instanceof Error ? error.message : "保存失败，请检查后重试")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(entry: KnowledgeEntry) {
    if (entry.status === "archived") return
    const ok = window.confirm(`确认归档「${entry.title}」？归档后默认列表不再显示，不是永久删除。`)
    if (!ok) return

    setArchivingId(entry.id)
    try {
      await archiveKnowledge(entry.id)
      toast.success("已归档")
      await load()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast.error(error instanceof Error ? error.message : "归档失败，请稍后重试")
    } finally {
      setArchivingId(null)
    }
  }

  const projectFilterLabel =
    projectFilter === "all" ? "全部项目" : projectNameById.get(projectFilter) || "所选项目"

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10" data-testid="customer-knowledge-workspace">
      <WorkbenchHero
        title="我的知识库"
        subtitle="沉淀你的定位、产品、客户与内容经验，AIM 会在创作时按项目调用。"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          当前条目 <span className="font-medium text-foreground">{visibleEntries.length}</span>
          <span className="mx-2">·</span>
          筛选项目 <span className="font-medium text-foreground">{projectFilterLabel}</span>
          <span className="mx-2">·</span>
          关键词仅搜当前已加载结果
        </div>
        <Button onClick={openCreate} data-testid="knowledge-add-button">
          <Plus className="mr-1.5 h-4 w-4" />
          新增知识
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索标题/内容/标签"
            data-testid="knowledge-keyword"
          />
        </div>
        <Select value={projectFilter} onValueChange={(value) => setProjectFilter(value ?? "all")}>
          <SelectTrigger data-testid="knowledge-project-filter">
            <SelectValue placeholder="项目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? "all")}>
          <SelectTrigger data-testid="knowledge-category-filter">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {KNOWLEDGE_CATEGORIES.map((key) => (
              <SelectItem key={key} value={key}>
                {CATEGORY_LABELS[key] ?? key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter((value as "active" | "archived") || "active")}
        >
          <SelectTrigger data-testid="knowledge-status-filter">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">有效</SelectItem>
            <SelectItem value="archived">已归档</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3" data-testid="knowledge-loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : loadError ? (
        <Card data-testid="knowledge-error">
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => void load()}>
              重试
            </Button>
          </CardContent>
        </Card>
      ) : visibleEntries.length === 0 ? (
        <Card data-testid="knowledge-empty">
          <CardContent className="space-y-2 py-10 text-center">
            {entries.length === 0 && !keyword.trim() ? (
              <>
                <p className="text-base font-medium">还没有知识内容</p>
                <p className="text-sm text-muted-foreground">
                  先添加你的产品、客户问题或个人经验，AIM 才能越用越懂你。
                </p>
                <Button className="mt-2" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  新增知识
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">没有符合当前条件的内容</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="knowledge-list">
          {visibleEntries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-medium">{entry.title}</h3>
                      <Badge variant="secondary">{CATEGORY_LABELS[entry.category] ?? entry.category}</Badge>
                      <Badge variant={entry.status === "archived" ? "outline" : "default"}>
                        {entry.status === "archived" ? "已归档" : "有效"}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{entry.content}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>项目：{entry.projectId ? projectNameById.get(entry.projectId) || "未知项目" : "全局资料"}</span>
                      <span>更新：{formatUpdatedAt(entry.updatedAt)}</span>
                      {entry.tags.slice(0, 6).map((tag) => (
                        <Badge key={tag} variant="outline" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(entry)}>
                      编辑
                    </Button>
                    {entry.status !== "archived" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleArchive(entry)}
                        disabled={archivingId === entry.id}
                      >
                        {archivingId === entry.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Archive className="mr-1 h-3.5 w-3.5" />
                        )}
                        归档
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CustomerKnowledgeEntryDialog
        open={dialogOpen}
        mode={dialogMode}
        form={form}
        projects={projects}
        saving={saving}
        onOpenChange={setDialogOpen}
        onFormChange={setForm}
        onSave={() => void handleSave()}
      />
    </div>
  )
}
