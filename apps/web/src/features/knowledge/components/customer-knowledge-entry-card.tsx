"use client"

import { Archive, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CATEGORY_LABELS } from "@/lib/knowledge-categories"
import type { KnowledgeEntry } from "@/lib/api/client"
import { formatKnowledgeUpdatedAt } from "@/features/knowledge/components/customer-knowledge-form"

const CATEGORY_DOT: Record<string, string> = {
  boss_experience: "bg-amber-500",
  positioning_material: "bg-amber-500",
  writing_style_profile: "bg-amber-500",
  product_usp: "bg-blue-500",
  customer_pain: "bg-blue-500",
  customer_qa: "bg-blue-500",
  project_case: "bg-blue-500",
  private_domain_material: "bg-blue-500",
  daily_inspiration: "bg-emerald-500",
  benchmark_reference: "bg-emerald-500",
  user_insight: "bg-emerald-500",
  hot_topic: "bg-emerald-500",
}

export function CustomerKnowledgeEntryCard(props: {
  entry: KnowledgeEntry
  projectName: string
  archiving: boolean
  onEdit: () => void
  onArchive: () => void
}) {
  const { entry } = props
  const dot = CATEGORY_DOT[entry.category] ?? "bg-muted-foreground"

  return (
    <article className="group rounded-lg border border-border/50 bg-card/50 p-3.5 transition-colors hover:border-border hover:bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <h3 className="truncate text-sm font-medium text-foreground">{entry.title}</h3>
          </div>
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap pl-3.5 text-sm text-muted-foreground">{entry.content}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-3.5 text-xs text-muted-foreground/70">
            <span>{CATEGORY_LABELS[entry.category] ?? entry.category}</span>
            <span>·</span>
            <span>{props.projectName}</span>
            <span>·</span>
            <span>{formatKnowledgeUpdatedAt(entry.updatedAt)}</span>
            {entry.tags.length > 0 && (
              <>
                <span>·</span>
                {entry.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={props.onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {entry.status !== "archived" ? (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={props.archiving} onClick={props.onArchive}>
              {props.archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
