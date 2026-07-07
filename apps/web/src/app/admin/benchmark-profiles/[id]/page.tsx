"use client"

import React from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getStoredAdminToken } from "@/lib/admin-store"
import { cn } from "@/lib/utils"

// ── 常量 ──

const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "B站",
  kuaishou: "快手",
}

const PLATFORM_COLORS: Record<string, string> = {
  douyin: "bg-pink-50 text-pink-700 border-pink-200",
  xiaohongshu: "bg-red-50 text-red-700 border-red-200",
  bilibili: "bg-blue-50 text-blue-700 border-blue-200",
  kuaishou: "bg-orange-50 text-orange-700 border-orange-200",
}

const KIND_LABELS: Record<string, string> = {
  note: "笔记",
  report: "诊断报告",
  copy_extraction: "文案提取",
  video: "爆款样本",
  account_pool: "账号池",
  structure_asset: "结构资产",
  topic_candidates: "选题池",
}

const KIND_COLORS: Record<string, string> = {
  note: "bg-gray-100 text-gray-600",
  report: "bg-indigo-50 text-indigo-600",
  copy_extraction: "bg-amber-50 text-amber-600",
  video: "bg-emerald-50 text-emerald-600",
  account_pool: "bg-violet-50 text-violet-600",
  structure_asset: "bg-fuchsia-50 text-fuchsia-600",
  topic_candidates: "bg-orange-50 text-orange-600",
}

// ── 类型 ──

interface ProfileItem {
  id: string
  kind: string
  title: string
  content: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface ProfileDetail {
  id: string
  name: string
  platform: string
  accountUrl: string | null
  platformUserId: string | null
  followerCount: number | null
  personaTags: unknown
  positioning: string | null
  differentiator: string | null
  takeaways: string | null
  competitorAnalysisId: string | null
  notes: string | null
  status: string
  createdAt: string
  updatedAt: string
  project: { id: string; name: string; companyName: string | null; industry: string | null } | null
  user: { id: string; name: string | null; email: string } | null
  items: ProfileItem[]
}

interface ImportableAnalysis {
  id: string
  targetUrl: string | null
  platform: string | null
  accountName: string | null
  overallScore: number | null
  status: string
  createdAt: string
  userId: string
  user: { email: string | null; name: string | null } | null
}

// ── 辅助 ──

function authHeaders(json = false): Record<string, string> {
  const token = getStoredAdminToken()
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ── 主页面 ──

export default function BenchmarkProfileDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  // 档案数据
  const [profile, setProfile] = React.useState<ProfileDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // 基础字段（可编辑）
  const [name, setName] = React.useState("")
  const [platform, setPlatform] = React.useState("")
  const [accountUrl, setAccountUrl] = React.useState("")
  const [followerCount, setFollowerCount] = React.useState("")
  const [positioning, setPositioning] = React.useState("")
  const [differentiator, setDifferentiator] = React.useState("")
  const [takeaways, setTakeaways] = React.useState("")
  const [notes, setNotes] = React.useState("")

  // items 逐条编辑状态
  const [editItems, setEditItems] = React.useState<Array<{ id: string; title: string; content: string; kind: string }>>([])
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(new Set())
  const [savingItemIds, setSavingItemIds] = React.useState<Set<string>>(new Set())

  // 顶部保存
  const [savingHeader, setSavingHeader] = React.useState(false)

  // 归档确认
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const [archiving, setArchiving] = React.useState(false)

  // 一键拉取
  const [importOpen, setImportOpen] = React.useState(false)
  const [importableAnalyses, setImportableAnalyses] = React.useState<ImportableAnalysis[]>([])
  const [importLoading, setImportLoading] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [importError, setImportError] = React.useState<string | null>(null)
  const [selectedAnalysisId, setSelectedAnalysisId] = React.useState("")

  // 加载详情
  async function fetchProfile() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${id}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(res.status === 404 ? "档案不存在" : "加载失败")
      const json = await res.json()
      const data = json.data as ProfileDetail
      setProfile(data)

      // 填充编辑状态
      setName(data.name)
      setPlatform(data.platform || "")
      setAccountUrl(data.accountUrl || "")
      setFollowerCount(data.followerCount != null ? String(data.followerCount) : "")
      setPositioning(data.positioning || "")
      setDifferentiator(data.differentiator || "")
      setTakeaways(data.takeaways || "")
      setNotes(data.notes || "")

      // 初始化 items 编辑状态
      setEditItems(data.items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        kind: item.kind,
      })))

      // 默认展开有内容的 item
      const expanded = new Set(data.items.filter((i) => i.content).map((i) => i.id))
      setExpandedItems(expanded)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── 保存头部字段 ──

  async function handleSaveHeader() {
    if (!profile) return
    const nextName = name.trim()
    if (!nextName) {
      setError("档案名称必填")
      return
    }
    setSavingHeader(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { name: nextName }
      if (platform) payload.platform = platform
      if (accountUrl.trim()) payload.accountUrl = accountUrl.trim()
      if (followerCount && Number.isFinite(Number(followerCount))) {
        payload.followerCount = Number(followerCount)
      } else {
        payload.followerCount = null
      }
      if (positioning.trim()) payload.positioning = positioning.trim()
      if (differentiator.trim()) payload.differentiator = differentiator.trim()
      if (takeaways.trim()) payload.takeaways = takeaways.trim()
      if (notes.trim()) payload.notes = notes.trim()

      const res = await fetch(`/api/admin/benchmark-profiles/${profile.id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "保存失败")

      await fetchProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSavingHeader(false)
    }
  }

  // ── 单条 item 保存 ──

  async function handleSaveItem(itemId: string) {
    const editItem = editItems.find((i) => i.id === itemId)
    if (!editItem || !editItem.content.trim()) return

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    setError(null)
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${id}/items/${itemId}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          title: editItem.title.trim(),
          content: editItem.content.trim(),
          kind: editItem.kind,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "保存失败")

      await fetchProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  // ── 单条 item 删除 ──

  async function handleDeleteItem(itemId: string) {
    if (!confirm("确定删除这条素材？")) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${id}/items/${itemId}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error("删除失败")
      await fetchProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败")
    }
  }

  // ── 新增空白 item ──

  async function handleAddItem() {
    if (!profile) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${profile.id}/items`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          title: "新素材",
          kind: "note",
          content: "",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "添加失败")
      await fetchProfile()
      // 展开新 item
      const newItemId = json.data.id
      setExpandedItems((prev) => new Set(prev).add(newItemId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败")
    }
  }

  // ── 更新 editItems 状态 ──

  function updateEditItem(itemId: string, field: "title" | "content" | "kind", value: string) {
    setEditItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    )
  }

  // ── 归档（Dialog 确认） ──

  async function handleArchive() {
    if (!profile) return
    setArchiving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${profile.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (res.ok) router.push("/admin/benchmark-profiles")
      else setError("归档失败")
    } catch {
      setError("归档失败")
    } finally {
      setArchiving(false)
      setArchiveOpen(false)
    }
  }

  // ── 一键拉取 ──

  async function openImportPicker() {
    setImportOpen(true)
    setImportError(null)
    setSelectedAnalysisId("")
    setImportLoading(true)
    try {
      const res = await fetch("/api/admin/benchmark-profiles/importable-analyses", {
        headers: authHeaders(),
      })
      const json = await res.json()
      setImportableAnalyses(json.data ?? [])
    } catch {
      setImportableAnalyses([])
    } finally {
      setImportLoading(false)
    }
  }

  async function handleImportAnalysis() {
    if (!profile || !selectedAnalysisId) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${profile.id}/import-analysis`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ competitorAnalysisId: selectedAnalysisId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "导入失败")

      if (json.data?.alreadyImported) {
        setImportError(json.data.message)
      } else {
        setImportOpen(false)
        await fetchProfile()
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "导入失败")
    } finally {
      setImporting(false)
    }
  }

  // ── 渲染 ──

  if (loading) return <DetailSkeleton />

  if (!profile) {
    return (
      <div className="mx-auto mt-8 max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <h2 className="text-lg font-semibold">{error ?? "档案不存在"}</h2>
            <Button variant="outline" onClick={() => router.push("/admin/benchmark-profiles")}>
              返回列表
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isAccount = !!platform

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/benchmark-profiles")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {platform && PLATFORM_LABELS[platform] && (
                <Badge variant="outline" className={cn("text-[10px]", PLATFORM_COLORS[platform])}>
                  {PLATFORM_LABELS[platform]}
                </Badge>
              )}
              {profile.project && (
                <span className="text-xs text-muted-foreground">
                  项目：{profile.project.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openImportPicker}
            className="text-primary"
          >
            <Download className="h-4 w-4 mr-1" />
            一键拉取
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setArchiveOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            归档
          </Button>
          <Button size="sm" onClick={handleSaveHeader} disabled={savingHeader}>
            {savingHeader ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            保存
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* 基础信息 */}
      <Card>
        <CardHeader>
          <CardTitle>基础信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>账号名称 / IP 名称 *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>平台</Label>
              <Select value={platform} onValueChange={(v) => { if (v) setPlatform(v) }}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="选择平台（可选）" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>主页链接</Label>
              <Input value={accountUrl} onChange={(e) => setAccountUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>粉丝数</Label>
              <Input
                type="number"
                value={followerCount}
                onChange={(e) => setFollowerCount(e.target.value)}
                placeholder="如：120000"
              />
            </div>
          </div>

          {/* 真实账号专属字段 */}
          {isAccount && (
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <Label>内容定位</Label>
                <Textarea
                  rows={2}
                  value={positioning}
                  onChange={(e) => setPositioning(e.target.value)}
                  placeholder="该账号的核心内容方向..."
                />
              </div>
              <div className="space-y-2">
                <Label>差异化</Label>
                <Textarea
                  rows={2}
                  value={differentiator}
                  onChange={(e) => setDifferentiator(e.target.value)}
                  placeholder="相比同类账号的独特之处..."
                />
              </div>
              <div className="space-y-2">
                <Label>借鉴要点</Label>
                <Textarea
                  rows={2}
                  value={takeaways}
                  onChange={(e) => setTakeaways(e.target.value)}
                  placeholder="迁移给本 IP 时怎么用..."
                />
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Label>备注（可选）</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="内部备注..." />
          </div>
        </CardContent>
      </Card>

      {/* 素材列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">素材资料（{editItems.length} 条）</h2>
          <Button variant="outline" size="sm" onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-1" />
            添加素材
          </Button>
        </div>

        {editItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">
                暂无素材。可点击「添加素材」手动添加，或使用「一键拉取」导入竞品分析。
              </p>
            </CardContent>
          </Card>
        ) : (
          editItems.map((item) => {
            const isExpanded = expandedItems.has(item.id)
            const isSaving = savingItemIds.has(item.id)

            return (
              <Card key={item.id}>
                <CardContent className="p-0">
                  {/* Item header */}
                  <button
                    type="button"
                    className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() =>
                      setExpandedItems((prev) => {
                        const next = new Set(prev)
                        if (next.has(item.id)) next.delete(item.id)
                        else next.add(item.id)
                        return next
                      })
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[10px]", KIND_COLORS[item.kind])}
                      >
                        {KIND_LABELS[item.kind] ?? item.kind}
                      </Badge>
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      {item.content && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.content.length} 字
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Item body (expanded) */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t pt-3">
                      <div className="space-y-2">
                        <Label className="text-xs">标题</Label>
                        <Input
                          className="h-9 text-sm"
                          value={item.title}
                          onChange={(e) => updateEditItem(item.id, "title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">类型</Label>
                        <Select
                          value={item.kind}
                          onValueChange={(v) => { if (v) updateEditItem(item.id, "kind", v) }}
                        >
                          <SelectTrigger className="h-9 text-sm w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(KIND_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">内容</Label>
                        <Textarea
                          className="min-h-32 text-sm"
                          value={item.content}
                          onChange={(e) => updateEditItem(item.id, "content", e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveItem(item.id)}
                          disabled={isSaving || !item.content.trim()}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5 mr-1" />
                          )}
                          保存此条
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          删除
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* ── 归档确认 Dialog ── */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认归档</DialogTitle>
            <DialogDescription>
              归档后，该档案及其所有素材将从 AIM 检索中移除。你可以随时在「已归档」列表中恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={archiving}>
              {archiving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  归档中
                </>
              ) : (
                "确认归档"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 一键拉取 Dialog ── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>一键拉取竞品分析</DialogTitle>
            <DialogDescription>
              选择一个已完成的竞品分析，导入账号诊断和爆款样本到当前档案。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {importLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : importableAnalyses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                暂无可导入的竞品分析记录
              </p>
            ) : (
              <Select value={selectedAnalysisId} onValueChange={(v) => { if (v) setSelectedAnalysisId(v) }}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="选择竞品分析..." />
                </SelectTrigger>
                <SelectContent>
                  {importableAnalyses.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span>{a.accountName || "未知账号"}</span>
                        {a.platform && PLATFORM_LABELS[a.platform] && (
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {PLATFORM_LABELS[a.platform]}
                          </Badge>
                        )}
                        {a.overallScore != null && (
                          <span className="text-muted-foreground text-xs">{a.overallScore}分</span>
                        )}
                        {a.user && (
                          <span className="text-muted-foreground text-xs">({a.user.email ?? a.user.name})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {importError ? (
              <p className="text-sm text-destructive">{importError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              取消
            </Button>
            <Button onClick={handleImportAnalysis} disabled={importing || !selectedAnalysisId}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  导入中
                </>
              ) : (
                "导入"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-7 w-48" />
      </div>
      <Skeleton className="h-60 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}
