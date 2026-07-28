"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  canSubmitWithPasteAttachment,
  createPastedCopyAttachment,
  inferPasteUsageFromInstruction,
  isLongCopyPaste,
  type PastedCopyAttachment,
  type PasteUsage,
} from "@/lib/aim/paste-copy-attachment"

export function useAimPasteCopyAttachment(input: {
  value: string
  pastedCopy: PastedCopyAttachment | null
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  onStyleSampleRequest?: (attachment: PastedCopyAttachment) => void
  imageCount: number
}) {
  const { value, pastedCopy, onPastedCopyChange, onStyleSampleRequest, imageCount } = input

  const pasteReady = canSubmitWithPasteAttachment({
    text: value,
    attachment: pastedCopy,
    hasImages: imageCount > 0,
  })

  const applyUsage = useCallback((usage: PasteUsage) => {
    if (!pastedCopy || !onPastedCopyChange) return
    const next = { ...pastedCopy, usage }
    onPastedCopyChange(next)
    if (usage === "style_sample") onStyleSampleRequest?.(next)
  }, [onPastedCopyChange, onStyleSampleRequest, pastedCopy])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPastedCopyChange) return
    const pasted = event.clipboardData.getData("text/plain")
    if (!isLongCopyPaste(pasted)) return

    event.preventDefault()
    const instruction = value.trim()
    const inferred = inferPasteUsageFromInstruction(instruction)
    const next = createPastedCopyAttachment(pasted, inferred)

    if (pastedCopy) {
      const replace = window.confirm("已有一篇文案附件。确定替换？取消则追加到现有附件。")
      if (replace) {
        onPastedCopyChange(next)
      } else {
        onPastedCopyChange(createPastedCopyAttachment(
          `${pastedCopy.content.trim()}\n\n${pasted.trim()}`,
          pastedCopy.usage ?? inferred,
        ))
      }
    } else {
      onPastedCopyChange(next)
    }
    if (inferred === "style_sample") {
      toast.message("已识别为风格样本，将打开风格预览")
      onStyleSampleRequest?.(next)
    }
  }, [onPastedCopyChange, onStyleSampleRequest, pastedCopy, value])

  useEffect(() => {
    if (!pastedCopy || pastedCopy.usage || !onPastedCopyChange) return
    const inferred = inferPasteUsageFromInstruction(value)
    if (!inferred) return
    onPastedCopyChange({ ...pastedCopy, usage: inferred })
    if (inferred === "style_sample") onStyleSampleRequest?.({ ...pastedCopy, usage: inferred })
  }, [value, pastedCopy, onPastedCopyChange, onStyleSampleRequest])

  return { pasteReady, applyUsage, handlePaste }
}
