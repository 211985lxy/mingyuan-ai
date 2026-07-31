"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bookmark, Loader2, Newspaper, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { NewsroomStageStrip } from "@/features/newsroom/components/newsroom-stage-strip"

type CollectionRow = {
  id: string
  name: string
  status: string
  projectId: string | null
  analysisError: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_LABEL: Record<string, string> = {
  draft: "待分析",
  analyzing: "分析中",
  analyzed: "已分析",
  failed: "分析失败",
}

/**
 * 已收藏研究：研究篮列表 + 分析 / 交给编辑室。
 */
export function OpportunityCollectionsPanel() {
  const router = useRouter()
  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/content-opportunities/collections?limit=30")
      if (!res.ok) throw new Error("加载研究篮失败")
      const data = await res.json() as { collections: CollectionRow[] }
      setCollections(data.collections ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAnalyze(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/content-opportunities/collections/${id}/analyze`, { method: "POST" })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || "触发分析失败")
      toast.success("已开始分析")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分析失败")
    } finally {
      setBusyId(null)
    }
  }

  async function handleNewsroom(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/content-opportunities/collections/${id}/newsroom`, { method: "POST" })
      const data = await res.json().catch(() => ({})) as {
        error?: string
        generationId?: string
        taskId?: string
        message?: string
      }
      if (!res.ok) throw new Error(data.error || "交给编辑室失败")
      toast.success(data.message || "已交给编辑室")
      if (data.generationId) {
        router.push(`/aim?generationId=${encodeURIComponent(data.generationId)}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "交给编辑室失败")
    } finally {
      setBusyId(null)
    }
  }

  async function handleWorkItem(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/content-opportunities/collections/${id}/create-work-item`, { method: "POST" })
      const data = await res.json().catch(() => ({})) as {
        error?: string
        generationId?: string
      }
      if (!res.ok) throw new Error(data.error || "创建经营事项失败")
      toast.success("经营事项已创建")
      if (data.generationId) {
        router.push(`/aim?generationId=${encodeURIComponent(data.generationId)}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建失败")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载研究篮…
      </div>
    )
  }

  if (collections.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Bookmark className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">还没有研究篮</p>
          <p className="mt-1 text-xs text-muted-foreground">
            在「对标账号 → 选题快速分析」里选中样本并保存后，可在此分析并交给编辑室
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {collections.map((row) => {
        const busy = busyId === row.id
        const analyzed = row.status === "analyzed"
        return (
          <Card key={row.id}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <Badge variant="secondary">{STATUS_LABEL[row.status] || row.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString("zh-CN")}
                  {row.analysisError ? ` · ${row.analysisError}` : ""}
                </p>
                {analyzed ? (
                  <NewsroomStageStrip stage="writing_ready" />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {row.status !== "analyzing" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleAnalyze(row.id)}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {analyzed ? "重新分析" : "分析"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !analyzed}
                  onClick={() => void handleWorkItem(row.id)}
                >
                  创建经营事项
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !analyzed}
                  onClick={() => void handleNewsroom(row.id)}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Newspaper className="h-3.5 w-3.5" />}
                  交给编辑室
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
