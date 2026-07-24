"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  knowledgeCategoryLabel,
  normalizeKnowledgeUsed,
  type AimKnowledgeUsedRef,
} from "@/lib/aim-knowledge-cite"
import { getKnowledge, type KnowledgeEntry } from "@/lib/api/knowledge"

type KnowledgeCitationPanelProps = {
  knowledgeUsed?: AimKnowledgeUsedRef[] | Array<{ id: string; title: string; category: string }>
  className?: string
  /** 紧凑模式：只显示「相关原文见」链接列表 */
  compact?: boolean
}

/**
 * 文案交付物旁的「相关原文」引用：可点开知识库原文。
 */
export function KnowledgeCitationPanel({
  knowledgeUsed,
  className,
  compact = false,
}: KnowledgeCitationPanelProps) {
  const refs = useMemo(() => normalizeKnowledgeUsed(knowledgeUsed), [knowledgeUsed])
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = refs.find((item) => item.id === activeId) ?? null

  if (refs.length === 0) return null

  return (
    <div className={className ?? (compact ? "text-xs" : "mb-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5")}>
      {!compact ? (
        <p className="mb-1 text-[11px] font-medium text-foreground/80">相关原文</p>
      ) : null}
      <ul className="space-y-0.5 text-xs leading-relaxed text-muted-foreground">
        {refs.map((item) => {
          const label = item.categoryLabel || knowledgeCategoryLabel(item.category)
          return (
            <li key={item.id}>
              <button
                type="button"
                className="max-w-full text-left text-primary underline-offset-2 hover:underline"
                onClick={() => setActiveId(item.id)}
              >
                相关原文见 《{item.title}》（{label}）
              </button>
              {!compact && item.snippet ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/90">{item.snippet}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
      <KnowledgeCitationPreviewDialog
        entryRef={active}
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActiveId(null)
        }}
      />
    </div>
  )
}

function KnowledgeCitationPreviewDialog({
  entryRef,
  open,
  onOpenChange,
}: {
  entryRef: AimKnowledgeUsedRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null)

  useEffect(() => {
    if (!open || !entryRef?.id) {
      setEntry(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void getKnowledge(entryRef.id)
      .then((payload) => {
        if (!cancelled) setEntry(payload)
      })
      .catch((err) => {
        if (!cancelled) {
          setEntry(null)
          setError(err instanceof Error ? err.message : "读取原文失败")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, entryRef?.id])

  const title = entry?.title || entryRef?.title || "知识原文"
  const label = knowledgeCategoryLabel(entry?.category || entryRef?.category || "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 text-base leading-snug">{title}</DialogTitle>
          <DialogDescription>{label || "知识库条目"}</DialogDescription>
        </DialogHeader>
        <div className="min-h-[8rem] overflow-y-auto rounded-md border border-border/60 bg-muted/15 px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载原文…
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-destructive">{error}</p>
              {entryRef?.snippet ? (
                <p className="text-muted-foreground">预览摘要：{entryRef.snippet}</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!entryRef?.id) return
                  setLoading(true)
                  setError(null)
                  void getKnowledge(entryRef.id)
                    .then(setEntry)
                    .catch((err) => setError(err instanceof Error ? err.message : "读取原文失败"))
                    .finally(() => setLoading(false))
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          ) : (
            entry?.content || entryRef?.snippet || "暂无正文"
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
