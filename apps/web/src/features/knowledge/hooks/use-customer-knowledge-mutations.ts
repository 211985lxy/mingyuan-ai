"use client"

import { useState } from "react"
import type { KnowledgeEntry } from "@/lib/api/client"
import {
  EMPTY_CUSTOMER_KNOWLEDGE_FORM,
  type CustomerKnowledgeForm,
} from "@/features/knowledge/components/customer-knowledge-form"
import {
  archiveCustomerKnowledgeEntry,
  saveCustomerKnowledgeEntry,
} from "@/features/knowledge/hooks/customer-knowledge-mutation-helpers"

export function useCustomerKnowledgeMutations(input: {
  projectFilter: string
  reload: () => Promise<void>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CustomerKnowledgeForm>(EMPTY_CUSTOMER_KNOWLEDGE_FORM)
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  function openCreate() {
    setDialogMode("create")
    setEditingId(null)
    setForm({
      ...EMPTY_CUSTOMER_KNOWLEDGE_FORM,
      projectId: input.projectFilter !== "all" ? input.projectFilter : "none",
    })
    setDialogOpen(true)
  }

  function openEdit(entry: KnowledgeEntry) {
    setDialogMode("edit")
    setEditingId(entry.id)
    setForm({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      tags: entry.tags.join(", "),
      projectId: entry.projectId || "none",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveCustomerKnowledgeEntry({
        mode: dialogMode,
        editingId,
        form,
        reload: input.reload,
        onSuccess: () => setDialogOpen(false),
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(entry: KnowledgeEntry) {
    setArchivingId(entry.id)
    try {
      await archiveCustomerKnowledgeEntry({ entry, reload: input.reload })
    } finally {
      setArchivingId(null)
    }
  }

  return {
    dialogOpen,
    setDialogOpen,
    dialogMode,
    form,
    setForm,
    saving,
    archivingId,
    openCreate,
    openEdit,
    handleSave,
    handleArchive,
  }
}
