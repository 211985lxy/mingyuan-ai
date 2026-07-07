"use client"

import React, { useMemo } from "react"
import {
  Search,
  Plus,
  Upload,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  FileText,
  ChevronDown,
  Folder,
  Globe,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { CollapsibleContent } from "@/components/admin/collapsible-content"
import {
  knowledgeCleanupLabel,
  parseKnowledgeTags,
} from "@/lib/knowledge-tags"

// ─── 类型定义（与 knowledge/page.tsx 保持一致） ────────────

export interface KnowledgeEntry {
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
  project?: {
    id: string
    name: string
    companyName: string | null
    industry: string | null
    status: string
  } | null
  embedding?: { status: string; updatedAt: string; errorMessage: string | null } | null
}

export interface AdminProject {
  id: string
  name: string
  companyName: string | null
  industry: string | null
  status: string
  knowledgeCount?: number
  user: { id: string; name: string | null; email: string }
}

/** /stats 返回的分类分布项 */
interface CategoryItem {
  category: string
  categoryLabel: string
  count: number
}

interface StatsResponse {
  totalEntries: number
  categoryDistribution: CategoryItem[]
}

export const BROWSER_CATEGORY_LABELS: Record<string, string> = {
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

// 价值分级配色（与条目列表 Tab 一致）
function gradeClassName(grade: string | null | undefined): string {
  if (grade === "S") return "border-amber-400 text-amber-700 bg-amber-50"
  if (grade === "A") return "border-emerald-500 text-emerald-700 bg-emerald-50"
  if (grade === "C") return "border-gray-400 text-gray-600 bg-gray-50"
  if (grade === "B") return "border-indigo-500 text-indigo-700 bg-indigo-50"
  return "border-border text-muted-foreground"
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return iso
  }
}

// ─── 左侧导航项 ────────────────────────────────────────────

interface NavProjectGroup {
  key: string // "" 表示全局/未绑定
  name: string
  sublabel: string | null
  count: number
}

interface KnowledgeBrowserProps {
  entries: KnowledgeEntry[]
  total: number
  loading: boolean
  page: number
  pageSize: number
  projects: AdminProject[]
  stats: StatsResponse | null
  /** 当前选中的项目过滤值（"" = 全部，"unbound" = 未绑定） */
  selectedProject: string
  /** 当前选中的分类过滤值（"" = 全部） */
  selectedCategory: string
  /** 当前搜索词（受控） */
  searchValue: string
  selectedIds: Set<string>
  onSelectProject: (value: string) => void
  onSelectCategory: (value: string) => void
  onSearchChange: (value: string) => void
  onPageChange: (page: number) => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (entry: KnowledgeEntry) => void
  onManualAdd: () => void
  onUpload: () => void
  onSmartImport: () => void
}

export function KnowledgeBrowser({
  entries,
  total,
  loading,
  page,
  pageSize,
  projects,
  stats,
  selectedProject,
  selectedCategory,
  searchValue,
  selectedIds,
  onSelectProject,
  onSelectCategory,
  onSearchChange,
  onPageChange,
  onToggleSelect,
  onOpenDetail,
  onManualAdd,
  onUpload,
  onSmartImport,
}: KnowledgeBrowserProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // 构建项目分组（全局/未绑定 + 各项目）。计数优先用 stats，回退到项目自身的 knowledgeCount。
  const projectGroups: NavProjectGroup[] = useMemo(() => {
    const groups: NavProjectGroup[] = [
      {
        key: "",
        name: "全部知识",
        sublabel: "所有项目",
        count: stats?.totalEntries ?? 0,
      },
    ]
    for (const p of projects) {
      groups.push({
        key: p.id,
        name: p.name,
        sublabel: p.companyName ?? p.industry ?? null,
        count: typeof p.knowledgeCount === "number" ? p.knowledgeCount : 0,
      })
    }
    groups.push({
      key: "unbound",
      name: "未绑定项目",
      sublabel: null,
      count: 0,
    })
    return groups
  }, [projects, stats])

  // 分类列表：用 stats 的分布（已补齐 12 类），没有 stats 时回退到固定 12 类
  const categoryItems: CategoryItem[] = useMemo(() => {
    if (stats?.categoryDistribution?.length) {
      return [...stats.categoryDistribution].sort((a, b) => b.count - a.count)
    }
    return Object.entries(BROWSER_CATEGORY_LABELS).map(([category, categoryLabel]) => ({
      category,
      categoryLabel,
      count: 0,
    }))
  }, [stats])

  const activeProjectGroup =
    projectGroups.find((g) => g.key === selectedProject) ?? projectGroups[0]
  const activeCategoryLabel = selectedCategory
    ? BROWSER_CATEGORY_LABELS[selectedCategory] ?? selectedCategory
    : null

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      {/* ─── 左侧导航树 ─── */}
      <aside className="w-full shrink-0 lg:w-72">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border bg-card p-3">
          {/* 项目分组 */}
          <div className="mb-1 flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Folder className="h-3.5 w-3.5" />
            项目
          </div>
          <nav className="space-y-0.5">
            {projectGroups.map((g) => {
              const active = selectedProject === g.key
              const isUnbound = g.key === "unbound"
              return (
                <button
                  key={g.key || "all"}
                  type="button"
                  onClick={() => onSelectProject(g.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  {isUnbound ? (
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{g.name}</span>
                  {g.sublabel ? (
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      {g.sublabel}
                    </span>
                  ) : null}
                  {g.count > 0 ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {g.count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          {/* 分类分组 */}
          <div className="mb-1 mt-4 flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            分类
          </div>
          <nav className="space-y-0.5">
            <button
              type="button"
              onClick={() => onSelectCategory("")}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                selectedCategory === ""
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <span className="flex-1">全部分类</span>
            </button>
            {categoryItems.map((c) => {
              const active = selectedCategory === c.category
              const empty = c.count === 0
              return (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => onSelectCategory(active ? "" : c.category)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : empty
                      ? "text-muted-foreground/70 hover:bg-muted"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="flex-1 truncate">{c.categoryLabel}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-primary/15 text-primary" : empty ? "bg-muted/60" : "bg-muted"
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* ─── 右侧文档区 ─── */}
      <div className="min-w-0 flex-1">
        {/* 工具条 */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {activeProjectGroup ? <span>{activeProjectGroup.name}</span> : null}
              {activeCategoryLabel ? (
                <>
                  <ChevronDown className="h-3 w-3 -rotate-90" />
                  <span className="text-foreground">{activeCategoryLabel}</span>
                </>
              ) : null}
              <span className="text-muted-foreground/60">·</span>
              <span>共 {total} 条</span>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onManualAdd}>
                <Plus className="mr-1 h-4 w-4" />
                手动录入
              </Button>
              <Button variant="outline" size="sm" onClick={onUpload}>
                <Upload className="mr-1 h-4 w-4" />
                上传文件
              </Button>
              <Button variant="outline" size="sm" onClick={onSmartImport}>
                <Sparkles className="mr-1 h-4 w-4" />
                智能导入
              </Button>
            </div>
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="relative max-w-md"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索标题或内容..."
              className="pl-9"
            />
          </form>
        </div>

        {/* 文档卡片流 */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4">
                <Skeleton className="mb-2 h-5 w-2/5" />
                <Skeleton className="mb-1.5 h-4 w-full" />
                <Skeleton className="mb-1.5 h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">暂无知识条目</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchValue
                ? "没有匹配的搜索结果，换个关键词试试"
                : "通过手动录入、上传文件或智能导入添加知识"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const cleanup = parseKnowledgeTags(entry.tags)
              const selected = selectedIds.has(entry.id)
              return (
                <article
                  key={entry.id}
                  className={`rounded-lg border bg-card p-4 transition-colors ${
                    selected ? "border-primary/40 bg-primary/5" : "hover:border-primary/30"
                  }`}
                >
                  <div className="mb-2 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(entry.id)}
                      className="mt-1 cursor-pointer"
                      aria-label={`选择 ${entry.title}`}
                    />
                    <button
                      type="button"
                      onClick={() => onOpenDetail(entry)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <h3 className="font-semibold leading-snug text-foreground hover:text-primary">
                        {entry.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.project ? entry.project.name : "未绑定项目"} ·{" "}
                        {entry.user?.name ?? entry.user?.email ?? "未知用户"}
                      </p>
                    </button>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {BROWSER_CATEGORY_LABELS[entry.category] ?? entry.category}
                    </Badge>
                  </div>

                  {/* 正文：markdown 渲染 + 长文折叠 */}
                  <div className="pl-7">
                    <CollapsibleContent collapsedMaxHeight={336}>
                      <MarkdownRenderer content={entry.content} />
                    </CollapsibleContent>
                  </div>

                  {/* meta 行 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                    {entry.valueGrade && ["S", "A", "B", "C"].includes(entry.valueGrade) ? (
                      <Badge variant="outline" className={`text-[10px] ${gradeClassName(entry.valueGrade)}`}>
                        {entry.valueGrade}
                      </Badge>
                    ) : null}
                    <Badge
                      variant={cleanup.isCleaned ? "outline" : "secondary"}
                      className="text-[10px]"
                    >
                      {knowledgeCleanupLabel(cleanup)}
                    </Badge>
                    {cleanup.assetRole ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {cleanup.assetRole}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {SOURCE_TYPE_LABELS[entry.sourceType] ?? entry.sourceType}
                    </span>
                    <span className="text-xs text-muted-foreground/60">·</span>
                    <span className="text-xs text-muted-foreground">
                      更新于 {formatDate(entry.updatedAt)}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* 分页 */}
        {total > pageSize ? (
          <div className="mt-6 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
