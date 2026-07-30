"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ExternalAiMemoryImportFields } from "@/features/knowledge/components/external-ai-memory-import-fields"
import {
  persistExternalAiMemoryDrafts,
  validateExternalMemoryImport,
} from "@/features/knowledge/hooks/external-ai-memory-import-helpers"
import type { ClientProject } from "@/lib/api/projects"
import {
  parseExternalAiMemoryText,
  type ParsedExternalAiMemory,
} from "@/lib/knowledge/external-ai-memory-parse"

export function ExternalAiMemoryImportDialog(props: {
  open: boolean
  projects: ClientProject[]
  defaultProjectId?: string
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [rawText, setRawText] = useState("")
  const [projectId, setProjectId] = useState(props.defaultProjectId || "")
  const [parsed, setParsed] = useState<ParsedExternalAiMemory | null>(null)
  const [saving, setSaving] = useState(false)
  const projectOptions = useMemo(
    () => props.projects.filter((p) => p.status !== "archived"),
    [props.projects],
  )

  function handleOpenChange(open: boolean) {
    if (!open) {
      setRawText("")
      setParsed(null)
      setSaving(false)
    } else if (props.defaultProjectId) {
      setProjectId(props.defaultProjectId)
    }
    props.onOpenChange(open)
  }

  function handleParse() {
    const next = parseExternalAiMemoryText(rawText)
    setParsed(next)
    if (!next.ok) toast.error(next.summary)
  }

  async function handleConfirm() {
    const error = validateExternalMemoryImport({ parsed, projectId })
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      const result = await persistExternalAiMemoryDrafts({ projectId, parsed: parsed! })
      toast.success(`已写入 ${result.count} 条基础记忆（${result.sourceLabel}）`)
      handleOpenChange(false)
      props.onImported()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "入库失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>粘贴外部 AI 记忆</DialogTitle>
          <DialogDescription>
            从 WorkBuddy / Codex / 千问复制「关于你的记忆」，拆成基础记忆写入定位素材。不改原文。
          </DialogDescription>
        </DialogHeader>
        <ExternalAiMemoryImportFields
          projectId={projectId}
          projects={projectOptions}
          rawText={rawText}
          parsed={parsed}
          saving={saving}
          onProjectIdChange={setProjectId}
          onRawTextChange={(value) => {
            setRawText(value)
            setParsed(null)
          }}
          onCancel={() => handleOpenChange(false)}
          onParse={handleParse}
          onConfirm={() => void handleConfirm()}
        />
      </DialogContent>
    </Dialog>
  )
}
