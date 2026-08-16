"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, MessageSquareText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FORMAT_LABELS, workflowStatusLabel } from "@/features/aim/aim-format-labels"
import type { AimGeneration } from "@/lib/api/aim"
import { listAimHistory } from "@/lib/api/client"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** 列表卡片标题：优先选题标题，回落到原始输入 */
function workTitle(item: AimGeneration) {
  return item.topicTitle?.trim() || item.rawInput.trim()
}

/**
 * 极简版「我的作品」：AIM 生成历史（与完整版侧栏「最近任务」同源）。
 * 点击进入完整版 /aim?generationId=… 查看全文、编辑与发布。
 */
export default function LiteWorksPage() {
  const router = useRouter()
  const [items, setItems] = useState<AimGeneration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listAimHistory(1, 50)
      .then((data) => setItems(data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2.5 h-3.5 w-full" />
            <Skeleton className="mt-1.5 h-3.5 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <MessageSquareText className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">还没有作品</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          在 AIM 工作台运行 IP 闭环生成的内容会保存在这里
        </p>
        <button
          type="button"
          className="mt-6 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => router.push("/home")}
        >
          去创作台
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-2.5 p-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="block w-full cursor-pointer rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
          onClick={() => router.push(`/aim?generationId=${encodeURIComponent(item.id)}`)}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-relaxed">
              {workTitle(item)}
            </p>
            <Badge variant="secondary" className="shrink-0 text-[11px] font-normal">
              {workflowStatusLabel(item.workflowStatus)}
            </Badge>
          </div>
          {(item.videoScript || item.wechatArticle || item.rawCopy) && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {(item.videoScript || item.wechatArticle || item.rawCopy)?.replace(/\s+/g, " ").slice(0, 120)}
            </p>
          )}
          <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {item.formatsRequested.slice(0, 3).map((format) => (
                <span key={format} className="shrink-0 rounded bg-muted px-1.5 py-0.5">
                  {FORMAT_LABELS[format as keyof typeof FORMAT_LABELS] ?? format}
                </span>
              ))}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <FileText className="size-3" />
              {formatDate(item.createdAt)}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
