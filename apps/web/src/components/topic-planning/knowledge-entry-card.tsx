"use client"

import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { KnowledgeEntry } from "@/lib/api/client"

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
}

function KnowledgeEntryActions({
  isEditing,
  isSaving,
  isArchiving,
  onSave,
  onEdit,
  onArchive,
}: {
  isEditing: boolean
  isSaving: boolean
  isArchiving: boolean
  onSave: () => void
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <Button size="sm" variant="outline" onClick={onSave} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存"}
        </Button>
      ) : (
        <Button size="icon-sm" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" onClick={onArchive} disabled={isArchiving}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function KnowledgeEntryContent({
  isEditing,
  content,
  onChange,
}: {
  isEditing: boolean
  content: string
  onChange: (value: string) => void
}) {
  return (
    <div className="mt-3">
      {isEditing ? (
        <Textarea
          value={content}
          className="min-h-28"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content}</p>
      )}
    </div>
  )
}

interface KnowledgeEntryCardProps {
  entry: KnowledgeEntry
  selected: boolean
  onToggleSelected: () => void
  onSave: (data: { title: string; content: string }) => Promise<void>
  onArchive: () => Promise<void>
}

export function KnowledgeEntryCard({
  entry,
  selected,
  onToggleSelected,
  onSave,
  onArchive,
}: KnowledgeEntryCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(entry.title)
  const [draftContent, setDraftContent] = useState(entry.content)
  const [isSaving, setIsSaving] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      await onSave({ title: draftTitle, content: draftContent })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleArchive() {
    setIsArchiving(true)
    try {
      await onArchive()
    } finally {
      setIsArchiving(false)
    }
  }

  function startEditing() {
    setDraftTitle(entry.title)
    setDraftContent(entry.content)
    setIsEditing(true)
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border"
            checked={selected}
            onChange={onToggleSelected}
          />
          <div className="space-y-1">
            {isEditing ? (
              <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
            ) : (
              <p className="text-sm font-semibold">{entry.title}</p>
            )}
            <p className="text-xs text-muted-foreground">录入于 {formatDate(entry.createdAt)}</p>
          </div>
        </label>
        <KnowledgeEntryActions
          isEditing={isEditing}
          isSaving={isSaving}
          isArchiving={isArchiving}
          onSave={handleSave}
          onEdit={startEditing}
          onArchive={handleArchive}
        />
      </div>

      <KnowledgeEntryContent
        isEditing={isEditing}
        content={isEditing ? draftContent : entry.content}
        onChange={setDraftContent}
      />
    </div>
  )
}
