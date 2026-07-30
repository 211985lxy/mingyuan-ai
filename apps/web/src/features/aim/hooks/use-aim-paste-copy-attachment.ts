"use client"

import { useCallback, useEffect, useMemo } from "react"
import { toast } from "sonner"

import type { AimAgentCapabilities } from "@/lib/aim/agent-capabilities"
import {
  canSubmitWithPasteAttachment,
  createPastedCopyAttachment,
  getAllowedPasteUsages,
  inferPasteUsageFromInstruction,
  isAnalyticsPasteCandidate,
  isLongCopyPaste,
  resolveInitialPasteUsage,
  type PastedCopyAttachment,
  type PasteUsage,
} from "@/lib/aim/paste-copy-attachment"

function guardUsage(
  usage: PasteUsage,
  capabilities: AimAgentCapabilities,
  allowedUsages: PasteUsage[],
): string | null {
  if (!allowedUsages.includes(usage)) return "当前专家不支持该文案用途"
  if (usage === "style_sample" && !capabilities.styleSample) return "当前专家不支持风格沉淀"
  if (usage === "benchmark" && !capabilities.benchmarkReference) return "当前专家不支持对标参考"
  return null
}

export function useAimPasteCopyAttachment(input: {
  value: string
  pastedCopy: PastedCopyAttachment | null
  onPastedCopyChange?: (next: PastedCopyAttachment | null) => void
  onStyleSampleRequest?: (attachment: PastedCopyAttachment) => void
  imageCount: number
  capabilities: AimAgentCapabilities
}) {
  const {
    value, pastedCopy, onPastedCopyChange, onStyleSampleRequest, imageCount, capabilities,
  } = input
  const pasteMode = capabilities.pasteMode
  const allowedUsages = useMemo(
    () => getAllowedPasteUsages(capabilities),
    [capabilities],
  )
  const pasteEnabled = pasteMode !== "plain" && Boolean(onPastedCopyChange)
  const pasteReady = canSubmitWithPasteAttachment({
    text: value, attachment: pastedCopy, hasImages: imageCount > 0,
  })

  const applyUsage = useCallback((usage: PasteUsage) => {
    if (!pastedCopy || !onPastedCopyChange) return
    const blocked = guardUsage(usage, capabilities, allowedUsages)
    if (blocked) { toast.message(blocked); return }
    const next = { ...pastedCopy, usage }
    onPastedCopyChange(next)
    if (usage === "style_sample") onStyleSampleRequest?.(next)
  }, [allowedUsages, capabilities, onPastedCopyChange, onStyleSampleRequest, pastedCopy])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!pasteEnabled || !onPastedCopyChange) return
    const pasted = event.clipboardData.getData("text/plain")
    const shouldCapture = pasteMode === "analytics"
      ? isAnalyticsPasteCandidate(pasted)
      : isLongCopyPaste(pasted)
    if (!shouldCapture) return
    event.preventDefault()
    const usage = resolveInitialPasteUsage({ pasteMode, instruction: value.trim(), allowedUsages })
    const next = createPastedCopyAttachment(pasted, usage)
    if (pastedCopy) {
      const replace = window.confirm(
        pasteMode === "analytics"
          ? "已有一份发布数据附件。确定替换？取消则追加到现有附件。"
          : "已有一篇文案附件。确定替换？取消则追加到现有附件。",
      )
      onPastedCopyChange(replace
        ? next
        : createPastedCopyAttachment(`${pastedCopy.content.trim()}\n\n${pasted.trim()}`, pastedCopy.usage ?? usage))
    } else {
      onPastedCopyChange(next)
    }
    if (usage === "style_sample" && capabilities.styleSample) {
      toast.message("已识别为风格样本，将打开风格预览")
      onStyleSampleRequest?.(next)
    }
  }, [allowedUsages, capabilities.styleSample, onPastedCopyChange, onStyleSampleRequest, pasteEnabled, pasteMode, pastedCopy, value])

  useEffect(() => {
    if (!pasteEnabled || !pastedCopy || pastedCopy.usage || !onPastedCopyChange) return
    if (pasteMode === "edit" || pasteMode === "review" || pasteMode === "analytics") {
      const auto = resolveInitialPasteUsage({ pasteMode, allowedUsages })
      if (auto) onPastedCopyChange({ ...pastedCopy, usage: auto })
      return
    }
    const inferred = inferPasteUsageFromInstruction(value)
    if (!inferred || !allowedUsages.includes(inferred)) return
    onPastedCopyChange({ ...pastedCopy, usage: inferred })
    if (inferred === "style_sample" && capabilities.styleSample) {
      onStyleSampleRequest?.({ ...pastedCopy, usage: inferred })
    }
  }, [allowedUsages, capabilities.styleSample, onPastedCopyChange, onStyleSampleRequest, pasteEnabled, pasteMode, pastedCopy, value])

  return { pasteReady, applyUsage, handlePaste, allowedUsages, pasteEnabled }
}
