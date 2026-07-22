"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bookmark, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface CollectionSummary {
  id: string
  name: string | null
  status: string
  createdAt: string
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "待研究", variant: "outline" },
  analyzing: { label: "分析中", variant: "secondary" },
  analyzed: { label: "已完成", variant: "default" },
  failed: { label: "分析失败", variant: "destructive" },
}

export function OpportunityCollectionsPanel() {
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/content-opportunities/collections")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setCollections(data.collections ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleAnalyze(id: string) {
    try {
      const res = await fetch(`/api/content-opportunities/collections/${id}/analyze`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "触发分析失败")
      }
      toast.success("分析任务已提交")
      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "analyzing" } : c)),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (collections.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Bookmark className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">暂无已收藏的研究</p>
          <p className="mt-1 text-xs text-muted-foreground">
            在「主动搜索」中选择 5-10 条内容保存为研究篮，即可进行 AI 批量拆解。
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {collections.map((c) => {
        const status = STATUS_LABELS[c.status] ?? STATUS_LABELS.draft
        return (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium truncate">
                  {c.name || "未命名研究篮"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={status.variant}>{status.label}</Badge>
                {(c.status === "draft" || c.status === "failed") && (
                  <Button size="sm" variant="outline" onClick={() => handleAnalyze(c.id)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    AI 研究
                  </Button>
                )}
                {c.status === "analyzed" && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/opportunities?tab=collections&id=${c.id}`}>
                      查看结果
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
