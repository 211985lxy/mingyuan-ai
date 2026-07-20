import type { FormEvent } from "react"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
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
import { TabsContent } from "@/components/ui/tabs"
import { JiekouTestPanel } from "@/features/knowledge/components/jiekou-test-panel"
import {
  CATEGORY_LABELS,
  SOURCE_TYPE_LABELS,
  embeddingLabel,
  projectLabel,
  type AdminProject,
  type KnowledgeEntry,
} from "@/features/knowledge/admin-knowledge-shared"
import { knowledgeCleanupLabel, parseKnowledgeTags } from "@/lib/knowledge-tags"

interface KnowledgeListTabProps {
  entries: KnowledgeEntry[]
  loading: boolean
  search: string
  categoryFilter: string
  projectFilter: string
  cleanupFilter: string
  gradeFilter: string
  projects: AdminProject[]
  selectedIds: Set<string>
  page: number
  pageSize: number
  total: number
  totalPages: number
  onSearch: (event: FormEvent) => void
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onProjectChange: (value: string) => void
  onCleanupChange: (value: string) => void
  onGradeChange: (value: string) => void
  onOpenAdd: () => void
  onOpenUpload: () => void
  onOpenSmartImport: () => void
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onOpenDetail: (entry: KnowledgeEntry) => void
  onSuggestCleanup: (entry: KnowledgeEntry) => void
  onDistill: () => void
  onBatchChangeGrade: (grade: string) => void
  onBatchArchive: () => void
  onBatchDelete: () => void
  onPageChange: (page: number) => void
}

/**
 * @description knowledgelisttab
 * @param props - 组件属性
 * @returns 无返回值
 */
export function KnowledgeListTab(props: KnowledgeListTabProps) {
  const {
    entries,
    loading,
    search,
    categoryFilter,
    projectFilter,
    cleanupFilter,
    gradeFilter,
    projects,
    selectedIds,
    page,
    pageSize,
    total,
    totalPages,
  } = props

  return (
    <TabsContent value="list">
      <JiekouTestPanel />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={props.onSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索标题或内容..."
                value={search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" className="cursor-pointer">搜索</Button>
          </form>
          <Button variant="outline" size="sm" onClick={props.onOpenAdd} className="cursor-pointer">
            <Plus className="h-4 w-4 mr-1" />手动录入
          </Button>
          <Button variant="outline" size="sm" onClick={props.onOpenUpload} className="cursor-pointer">
            <Upload className="h-4 w-4 mr-1" />上传文件
          </Button>
          <Button variant="outline" size="sm" onClick={props.onOpenSmartImport} className="cursor-pointer">
            <Sparkles className="h-4 w-4 mr-1" />智能导入
          </Button>
          <Select value={categoryFilter || "all"} onValueChange={(value) => props.onCategoryChange(value === "all" ? "" : (value ?? ""))}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="全部分类" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectFilter || "all"} onValueChange={(value) => props.onProjectChange(value === "all" ? "" : (value ?? ""))}>
            <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="全部项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              <SelectItem value="unbound">未绑定项目</SelectItem>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{projectLabel(project)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cleanupFilter || "all"} onValueChange={(value) => props.onCleanupChange(value === "all" ? "" : (value ?? ""))}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="清洗状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部清洗状态</SelectItem>
              <SelectItem value="ip">IP资产</SelectItem><SelectItem value="project">项目资产</SelectItem>
              <SelectItem value="pending_verify">待核验</SelectItem><SelectItem value="topic">可用于选题</SelectItem>
              <SelectItem value="sales">可用于成交</SelectItem><SelectItem value="uncleaned">未清洗</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gradeFilter || "all"} onValueChange={(value) => props.onGradeChange(value === "all" ? "" : (value ?? ""))}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="价值分级" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分级</SelectItem><SelectItem value="S">S · 战略级</SelectItem>
              <SelectItem value="A">A · 战术级</SelectItem><SelectItem value="B">B · 参考级</SelectItem><SelectItem value="C">C · 索引级</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">已选 {selectedIds.size} 条</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={props.onDistill} className="cursor-pointer">
              <Sparkles className="h-4 w-4 mr-1" />知识蒸馏
            </Button>
            <Select onValueChange={(value) => props.onBatchChangeGrade(typeof value === "string" ? value : "")}>
              <SelectTrigger className="w-[150px] h-8"><SelectValue placeholder="改分级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="S">S · 战略级</SelectItem><SelectItem value="A">A · 战术级</SelectItem>
                <SelectItem value="B">B · 参考级</SelectItem><SelectItem value="C">C · 索引级</SelectItem><SelectItem value="">清除分级</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={props.onBatchArchive} className="cursor-pointer">
              <Archive className="h-4 w-4 mr-1" />归档
            </Button>
            <Button variant="destructive" size="sm" onClick={props.onBatchDelete} className="cursor-pointer">
              <Trash2 className="h-4 w-4 mr-1" />删除
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 p-3 text-left">
                    <input type="checkbox" checked={entries.length > 0 && selectedIds.size === entries.length} onChange={props.onToggleSelectAll} className="cursor-pointer" />
                  </th>
                  <th className="text-left p-3 font-medium">标题</th><th className="text-left p-3 font-medium hidden xl:table-cell">项目</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">用户</th><th className="text-left p-3 font-medium">分类</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">来源</th><th className="text-left p-3 font-medium">状态</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">向量</th><th className="text-left p-3 font-medium hidden lg:table-cell">更新</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => <tr key={index} className="border-b"><td className="p-3" colSpan={9}><Skeleton className="h-4 w-full" /></td></tr>)
                ) : entries.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">暂无知识库条目</td></tr>
                ) : entries.map((entry) => {
                  const cleanup = parseKnowledgeTags(entry.tags)
                  return (
                    <tr key={entry.id} className={`border-b hover:bg-muted/30 transition-colors ${selectedIds.has(entry.id) ? "bg-primary/5" : ""}`}>
                      <td className="p-3"><input type="checkbox" checked={selectedIds.has(entry.id)} onChange={() => props.onToggleSelect(entry.id)} className="cursor-pointer" /></td>
                      <td className="p-3 max-w-[260px]">
                        <button type="button" onClick={() => props.onOpenDetail(entry)} className="flex max-w-full items-center gap-1 truncate text-left font-medium hover:text-primary">
                          <Eye className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{entry.title}</span>
                        </button>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">{entry.content.slice(0, 80)}...</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.valueGrade && ["S", "A", "B", "C"].includes(entry.valueGrade) && (
                            <Badge variant="outline" className={`text-[10px] ${entry.valueGrade === "S" ? "border-amber-400 text-amber-700 bg-amber-50" : entry.valueGrade === "A" ? "border-emerald-500 text-emerald-700 bg-emerald-50" : entry.valueGrade === "C" ? "border-gray-400 text-gray-600 bg-gray-50" : "border-indigo-500 text-indigo-700 bg-indigo-50"}`}>
                              {entry.valueGrade}
                            </Badge>
                          )}
                          <Badge variant={cleanup.isCleaned ? "outline" : "secondary"} className="text-[10px]">{knowledgeCleanupLabel(cleanup)}</Badge>
                          {cleanup.assetRole ? <Badge variant="secondary" className="text-[10px]">{cleanup.assetRole}</Badge> : null}
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => props.onSuggestCleanup(entry)}>清洗建议</Button>
                        </div>
                      </td>
                      <td className="p-3 hidden xl:table-cell text-muted-foreground text-xs">
                        {entry.project ? <><p className="max-w-[180px] truncate text-foreground">{entry.project.name}</p><p className="max-w-[180px] truncate">{entry.project.companyName || entry.project.industry || "项目知识"}</p></> : "全局/未绑定"}
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{entry.user?.name ?? entry.user?.email ?? "未知"}</td>
                      <td className="p-3"><Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[entry.category] || entry.category}</Badge></td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{SOURCE_TYPE_LABELS[entry.sourceType] || entry.sourceType}</td>
                      <td className="p-3"><Badge variant={entry.status === "active" ? "default" : "secondary"} className="text-xs">{entry.status === "active" ? "生效" : "已归档"}</Badge></td>
                      <td className="p-3 hidden lg:table-cell"><Badge variant={entry.embedding?.status === "completed" ? "default" : entry.embedding?.status === "failed" ? "destructive" : "secondary"} className="text-xs">{embeddingLabel(entry)}</Badge></td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{new Date(entry.updatedAt).toLocaleDateString("zh-CN")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}，共 {total} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => props.onPageChange(page - 1)} className="cursor-pointer"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => props.onPageChange(page + 1)} className="cursor-pointer"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </TabsContent>
  )
}
