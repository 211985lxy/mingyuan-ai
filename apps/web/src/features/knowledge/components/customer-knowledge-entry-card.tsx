"use client"

import { Archive, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CATEGORY_LABELS } from "@/lib/knowledge-categories"
import type { KnowledgeEntry } from "@/lib/api/client"
import { formatKnowledgeUpdatedAt } from "@/features/knowledge/components/customer-knowledge-form"

export function CustomerKnowledgeEntryCard(props: {
  entry: KnowledgeEntry
  projectName: string
  archiving: boolean
  onEdit: () => void
  onArchive: () => void
}) {
  const { entry } = props
  return (
    <article className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">{entry.title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {CATEGORY_LABELS[entry.category] ?? entry.category}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {props.projectName}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{entry.content}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>更新于 {formatKnowledgeUpdatedAt(entry.updatedAt)}</span>
            {entry.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-border/60 px-2 py-0.5">#{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={props.onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />编辑
          </Button>
          {entry.status !== "archived" ? (
            <Button variant="ghost" size="sm" disabled={props.archiving} onClick={props.onArchive}>
              {props.archiving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="mr-1.5 h-3.5 w-3.5" />
              )}
              归档
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
