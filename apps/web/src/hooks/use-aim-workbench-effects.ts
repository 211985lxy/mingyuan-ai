"use client"

import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"

import { getVideoCopyExtraction } from "@/lib/api/client"
import { aimDraftProjectScope, saveAimDraft, type AimDraft } from "@/lib/aim/draft-storage"
import { formatAnalysisResultForPrompt } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

export function useAimDraftAutosave(draft: AimDraft, projectEnabled: boolean) {
  const {
    selectedAgentId, selectedProjectId, input, messages, videoCopyExtractionId,
    sourceOriginalText, sourceAnalysisText, sourceTopicTitle, sourceTopicRationale,
    editorText, editorFormat, editorSourceMessageId, editorPanelWidth, editorPanelOpen,
  } = draft
  useEffect(() => {
    saveAimDraft({
      selectedAgentId, selectedProjectId, input, messages, videoCopyExtractionId,
      sourceOriginalText, sourceAnalysisText, sourceTopicTitle, sourceTopicRationale,
      editorText, editorFormat, editorSourceMessageId, editorPanelWidth, editorPanelOpen,
    }, aimDraftProjectScope(projectEnabled, selectedProjectId))
  }, [
    editorFormat, editorPanelOpen, editorPanelWidth, editorSourceMessageId, editorText,
    input, messages, projectEnabled, selectedAgentId, selectedProjectId, sourceAnalysisText,
    sourceOriginalText, sourceTopicRationale, sourceTopicTitle, videoCopyExtractionId,
  ])
}

export function useAimMessageAutoScroll(input: {
  scrollRef: RefObject<HTMLDivElement | null>
  pendingMessageIdRef: MutableRefObject<string | null>
  messages: AimWorkbenchMessage[]
  isThinking: boolean
  isGenerating: boolean
}) {
  const { scrollRef, pendingMessageIdRef, messages, isThinking, isGenerating } = input
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const targetId = pendingMessageIdRef.current
    if (targetId) {
      pendingMessageIdRef.current = null
      requestAnimationFrame(() => element.querySelector<HTMLElement>(`[data-message-id="${targetId}"]`)?.scrollIntoView({ block: "start" }))
      return
    }
    element.scrollTop = element.scrollHeight
  }, [isGenerating, isThinking, messages, pendingMessageIdRef, scrollRef])
}

export function useAimSourceHydration(input: {
  extractionId?: string
  sourceOriginalText: string
  sourceAnalysisText: string
  setSourceOriginalText: Dispatch<SetStateAction<string>>
  setSourceAnalysisText: Dispatch<SetStateAction<string>>
}) {
  const { extractionId, sourceOriginalText, sourceAnalysisText, setSourceOriginalText, setSourceAnalysisText } = input
  useEffect(() => {
    if (!extractionId || (sourceOriginalText.trim() && sourceAnalysisText.trim())) return
    let active = true
    getVideoCopyExtraction(extractionId)
      .then((record) => {
        if (!active) return
        const analysisText = formatAnalysisResultForPrompt(record.analysisResult) || ""
        if (!sourceOriginalText.trim()) setSourceOriginalText(record.transcript || "")
        if (!sourceAnalysisText.trim()) setSourceAnalysisText(analysisText)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [extractionId, setSourceAnalysisText, setSourceOriginalText, sourceAnalysisText, sourceOriginalText])
}
