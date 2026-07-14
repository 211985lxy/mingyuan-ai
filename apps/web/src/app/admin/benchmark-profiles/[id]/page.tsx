"use client"

import React from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  Save,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ProfileBasicForm } from "@/features/benchmark-profiles/components/profile-basic-form"
import { ProfileDetailDialogs } from "@/features/benchmark-profiles/components/profile-detail-dialogs"
import { ProfileMaterials } from "@/features/benchmark-profiles/components/profile-materials"
import { PLATFORM_COLORS, PLATFORM_LABELS, type EditableProfileItem, type ImportableAnalysis, type ProfileDetail } from "@/features/benchmark-profiles/model"
import { cn } from "@/lib/utils"

// ── 辅助 ──

function authHeaders(json = false): Record<string, string> {
  return json ? { "Content-Type": "application/json" } : {}
}

// ── 主页面 ──

export default function BenchmarkProfileDetailPage() {
  const params = useParams<{ id: string }>() ?? { id: "" }
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
  const [editItems, setEditItems] = React.useState<EditableProfileItem[]>([])
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

      <ProfileBasicForm
        name={name}
        platform={platform}
        accountUrl={accountUrl}
        followerCount={followerCount}
        positioning={positioning}
        differentiator={differentiator}
        takeaways={takeaways}
        notes={notes}
        onNameChange={setName}
        onPlatformChange={setPlatform}
        onAccountUrlChange={setAccountUrl}
        onFollowerCountChange={setFollowerCount}
        onPositioningChange={setPositioning}
        onDifferentiatorChange={setDifferentiator}
        onTakeawaysChange={setTakeaways}
        onNotesChange={setNotes}
      />

      <ProfileMaterials
        items={editItems}
        expandedIds={expandedItems}
        savingIds={savingItemIds}
        onAdd={handleAddItem}
        onToggle={(itemId) => setExpandedItems((current) => { const next = new Set(current); if (next.has(itemId)) next.delete(itemId); else next.add(itemId); return next })}
        onUpdate={updateEditItem}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      <ProfileDetailDialogs
        archiveOpen={archiveOpen}
        archiving={archiving}
        importOpen={importOpen}
        importLoading={importLoading}
        importing={importing}
        analyses={importableAnalyses}
        selectedAnalysisId={selectedAnalysisId}
        importError={importError}
        onArchiveOpenChange={setArchiveOpen}
        onArchive={handleArchive}
        onImportOpenChange={setImportOpen}
        onAnalysisChange={setSelectedAnalysisId}
        onImport={handleImportAnalysis}
      />
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
