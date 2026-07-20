"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"

// ─── 类型 ──────────────────────────────────────────────────────

export interface AdminProject {
  id: string
  name: string
  companyName: string | null
  industry: string | null
  status: string
  user: { id: string; name: string | null; email: string }
}

interface CategoryItem {
  category: string
  categoryLabel: string
  count: number
}

interface ValueGradeItem {
  valueGrade: string | null
  count: number
}

interface ProjectItem {
  projectId: string | null
  projectName: string | null
  companyName: string | null
  entryCount: number
  categoryCoverage: number
}

interface SourceTypeItem {
  sourceType: string
  sourceLabel: string
  count: number
}

interface EmbeddingStatusItem {
  status: string
  label: string
  count: number
}

interface CategoryHealth {
  totalCategories: number
  activeCategories: number
  ungradedCount: number
  unboundCount: number
}

interface StatsResponse {
  totalEntries: number
  categoryDistribution: CategoryItem[]
  valueGradeDistribution: ValueGradeItem[]
  projectDistribution: ProjectItem[]
  sourceTypeDistribution: SourceTypeItem[]
  embeddingStatus: EmbeddingStatusItem[]
  categoryHealth: CategoryHealth
}

interface KnowledgeMapProps {
  projects: AdminProject[]
  onDrillDown?: (filters: { category?: string }) => void
}

// ─── 常量 ──────────────────────────────────────────────────────

const VALUE_GRADE_COLORS: Record<string, string> = {
  S: "#f59e0b",
  A: "#10b981",
  B: "#6366f1",
  C: "#9ca3af",
}

const VALUE_GRADE_LABELS: Record<string, string> = {
  S: "S · 战略级",
  A: "A · 战术级",
  B: "B · 参考级",
  C: "C · 索引级",
}

function gradeLabel(grade: string | null): string {
  return VALUE_GRADE_LABELS[grade ?? ""] ?? "未分级"
}

function gradeColor(grade: string | null): string {
  return VALUE_GRADE_COLORS[grade ?? ""] ?? "#94a3b8"
}

function embeddingColor(status: string): string {
  if (status === "completed") return "#22c55e"
  if (status === "failed") return "#ef4444"
  return "#94a3b8"
}

// ─── 组件 ──────────────────────────────────────────────────────

/**
 * @description knowledgemap
 * @param options - 配置选项
 * @returns 无返回值
 */
export function KnowledgeMap({ projects, onDrillDown }: KnowledgeMapProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const qs = selectedProjectId ? `?projectId=${encodeURIComponent(selectedProjectId)}` : ""
      const res = await fetch(`/api/admin/knowledge/stats${qs}`)
      const json = await res.json()
      setStats(json.data ?? json)
    } catch (err) {
      console.error("[knowledge-map] fetchStats error:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await fetchStats()
    })()
  }, [fetchStats])

  // 分类数据：补齐 12 类，按数量降序
  const sortedCategories = [...(stats?.categoryDistribution ?? [])].sort((a, b) => b.count - a.count)

  // 项目维度数据：项目 + 分类名称
  const projectBars = (stats?.projectDistribution ?? []).map((p) => ({
    ...p,
    label: p.projectName ?? "未绑定项目",
    subCategories: (p.categoryCoverage ?? 0) as number,
  }))

  // 价值分级
  const gradeData = (stats?.valueGradeDistribution ?? []).map((g) => ({
    name: gradeLabel(g.valueGrade),
    value: g.count,
    fill: gradeColor(g.valueGrade),
  }))

  // 健康指标计算
  const health = stats?.categoryHealth ?? { totalCategories: 12, activeCategories: 0, ungradedCount: 0, unboundCount: 0 }
  const coveragePct = health ? Math.round((health.activeCategories / health.totalCategories) * 100) : 0
  const gradedPct = stats && stats.totalEntries > 0
    ? Math.round(((stats.totalEntries - health.ungradedCount) / stats.totalEntries) * 100)
    : 0
  const boundPct = stats && stats.totalEntries > 0
    ? Math.round(((stats.totalEntries - health.unboundCount) / stats.totalEntries) * 100)
    : 0

  function coverageColor(pct: number): string {
    if (pct >= 83) return "text-emerald-600"
    if (pct >= 58) return "text-amber-600"
    return "text-red-600"
  }

  return (
    <div className="space-y-4">
      {/* 顶部：项目筛选 + 总览 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex-1 flex gap-2">
          <h2 className="text-lg font-semibold shrink-0">知识地图</h2>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
        <Select
          value={selectedProjectId || "all"}
          onValueChange={(v) => setSelectedProjectId(v === "all" ? "" : (v ?? ""))}
        >
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="全部项目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.companyName ? ` · ${p.companyName}` : ""}
              </SelectItem>
            ))}
            <SelectItem value="unbound">未绑定项目</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 健康指标横条 */}
      {stats && (
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">总条目</span>
            <span className="font-semibold">{stats.totalEntries}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">分类覆盖</span>
            <span className={`font-semibold ${coverageColor(coveragePct)}`}>
              {health.activeCategories}/{health.totalCategories} ({coveragePct}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">已分级</span>
            <span className={`font-semibold ${coverageColor(gradedPct)}`}>{gradedPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">项目绑定</span>
            <span className={`font-semibold ${coverageColor(boundPct)}`}>{boundPct}%</span>
          </div>
        </div>
      )}

      {/* 图表面板 */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats && stats.totalEntries > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* 1. 分类分布 — 横向柱状图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">分类分布</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(sortedCategories.length * 36, 200)}>
                <BarChart data={sortedCategories} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="categoryLabel"
                    width={80}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(v: number) => `${v} 条`} />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data?.category && onDrillDown) onDrillDown({ category: data.category })
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 2. 价值分级 — 环形图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">价值分级</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={gradeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {gradeData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => `${name}: ${v} 条`} />
                  <Legend
                    formatter={(value: string) => value}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 3. 项目维度 — 堆叠横向柱状图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">项目维度</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(projectBars.length * 40, 200)}>
                <BarChart data={projectBars} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="label" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v} 条`} />
                  <Bar dataKey="entryCount" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} name="知识条目" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-muted-foreground mt-2">
                每行标签末尾的数字为该项目的分类覆盖数（满分 {health?.totalCategories ?? 0}）
              </p>
            </CardContent>
          </Card>

          {/* 4. 知识来源 — 环形图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">知识来源</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.sourceTypeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="count"
                  >
                    {stats.sourceTypeDistribution.map((_entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          index === 0
                            ? "hsl(var(--primary))"
                            : index === 1
                              ? "#f97316"
                              : index === 2
                                ? "#8b5cf6"
                                : "#94a3b8"
                        }
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => `${name}: ${v} 条`} />
                  <Legend
                    formatter={(value: string) => {
                      const item = stats?.sourceTypeDistribution.find((s) => s.sourceType === value)
                      return item?.sourceLabel ?? value
                    }}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 5. 向量化状态 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">向量化状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.embeddingStatus.map((item) => {
                const pct = stats.totalEntries > 0 ? Math.round((item.count / stats.totalEntries) * 100) : 0
                return (
                  <div key={item.status} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-muted-foreground shrink-0">{item.label}</div>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: embeddingColor(item.status) }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-xs text-right text-muted-foreground">
                      {item.count} ({pct}%)
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* 6. 分类覆盖率详情 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">分类覆盖率详情</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sortedCategories.map((cat) => {
                  const has = cat.count > 0
                  return (
                    <div
                      key={cat.category}
                      className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                        has ? "bg-emerald-50/50 border-emerald-200/60" : "bg-muted/30 border-border/60"
                      } ${has ? "cursor-pointer" : ""}`}
                      onClick={has && onDrillDown ? () => onDrillDown({ category: cat.category }) : undefined}
                    >
                      <div
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          has ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      />
                      <span className="truncate font-medium">{cat.categoryLabel}</span>
                      <span className={`ml-auto ${has ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {cat.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            暂无知识库条目，请先通过录入或上传添加知识。
          </CardContent>
        </Card>
      )}
    </div>
  )
}
