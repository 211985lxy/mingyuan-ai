"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import type { StyleProfileDelta } from "@/lib/aim-style-evolution"
import {
  commitSelectedStyleDelta,
  runStylePreviewAnalysis,
} from "@/features/aim/hooks/style-preview-actions"
import {
  dimHasContent,
  STYLE_DIMENSION_LABELS,
} from "@/features/aim/hooks/style-preview-helpers"

export { dimHasContent, formatStyleDim, STYLE_DIMENSION_LABELS } from "@/features/aim/hooks/style-preview-helpers"

export function useAimStylePreview(input: {
  open: boolean
  samples: Array<{ content: string; label?: "core" | "normal" }>
  projectId?: string | null
  onOpenChange: (open: boolean) => void
  onCommitted?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [delta, setDelta] = useState<StyleProfileDelta | null>(null)
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const runPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDelta(null)
    const result = await runStylePreviewAnalysis({
      samples: input.samples,
      projectId: input.projectId,
    })
    if (result.error || !result.delta) {
      setError(result.error || "风格分析没有产出候选")
    } else {
      setDelta(result.delta)
      setEnabledKeys(new Set(
        STYLE_DIMENSION_LABELS.filter(({ key }) => dimHasContent(result.delta![key])).map(({ key }) => key),
      ))
    }
    setLoading(false)
  }, [input.projectId, input.samples])

  useEffect(() => {
    if (!input.open || input.samples.length === 0) return
    void runPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.open])

  function resetLocal() {
    setDelta(null)
    setError(null)
    setEnabledKeys(new Set())
  }

  function toggleKey(key: string) {
    setEnabledKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleCommit() {
    if (!delta) return
    setCommitting(true)
    const result = await commitSelectedStyleDelta({
      delta,
      enabledKeys,
      projectId: input.projectId,
    })
    if (!result.ok) toast.error(result.message)
    else {
      input.onOpenChange(false)
      resetLocal()
      input.onCommitted?.()
    }
    setCommitting(false)
  }

  return { loading, committing, delta, enabledKeys, error, runPreview, resetLocal, toggleKey, handleCommit }
}
