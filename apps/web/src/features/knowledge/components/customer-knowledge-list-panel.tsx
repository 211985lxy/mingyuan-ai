"use client"

import { BookOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { KnowledgeEntry } from "@/lib/api/client"
import { CustomerKnowledgeEntryCard } from "@/features/knowledge/components/customer-knowledge-entry-card"

export function CustomerKnowledgeListPanel(props: {
  loading: boolean
  loadError: string | null
  entries: KnowledgeEntry[]
  projectNameById: Map<string, string>
  archivingId: string | null
  onRetry: () => void
  onEdit: (entry: KnowledgeEntry) => void
  onArchive: (entry: KnowledgeEntry) => void
}) {
  if (props.loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-card/40 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载知识库…
      </div>
    )
  }

  if (props.loadError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="text-destructive">{props.loadError}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={props.onRetry}>重试</Button>
      </div>
    )
  }

  if (props.entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium text-foreground">还没有符合条件的知识</p>
        <p className="mt-1 text-sm text-muted-foreground">先新增几条老板原话、产品卖点或客户案例，AIM 写稿时才能用上。</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {props.entries.map((entry) => (
        <CustomerKnowledgeEntryCard
          key={entry.id}
          entry={entry}
          projectName={entry.projectId ? props.projectNameById.get(entry.projectId) || "项目资料" : "全局资料"}
          archiving={props.archivingId === entry.id}
          onEdit={() => props.onEdit(entry)}
          onArchive={() => props.onArchive(entry)}
        />
      ))}
    </div>
  )
}
