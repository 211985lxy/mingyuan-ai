"use client"

import { useCallback, useState } from "react"

import type { ContentFormat } from "@/lib/api/client"
import { EDITOR_PANEL_DEFAULT_WIDTH } from "@/lib/aim-editor"
import type { AimDraft } from "@/lib/aim/draft-storage"
import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"

const EMPTY_SELECTION: AimEditorSelection = { text: "", range: { start: 0, end: 0 } }

/**
 * AIM 工作台：原文 / 选题 / 右侧编辑器草稿状态。
 */
export function useAimSourceEditorState(initialDraft: AimDraft | null) {
  const [sourceVideoCopyExtractionId, setSourceVideoCopyExtractionId] = useState<string | undefined>(
    () => initialDraft?.videoCopyExtractionId,
  )
  const [sourceOriginalText, setSourceOriginalText] = useState(() => initialDraft?.sourceOriginalText || "")
  const [sourceAnalysisText, setSourceAnalysisText] = useState(() => initialDraft?.sourceAnalysisText || "")
  const [sourceTopicTitle, setSourceTopicTitle] = useState(() => initialDraft?.sourceTopicTitle || "")
  const [sourceTopicRationale, setSourceTopicRationale] = useState(() => initialDraft?.sourceTopicRationale || "")
  const [editorText, setEditorText] = useState(() => initialDraft?.editorText || "")
  const [editorFormat, setEditorFormat] = useState<ContentFormat | undefined>(() => initialDraft?.editorFormat)
  const [editorSourceMessageId, setEditorSourceMessageId] = useState<string | undefined>(
    () => initialDraft?.editorSourceMessageId,
  )
  const [editorPanelWidth, setEditorPanelWidth] = useState(
    () => initialDraft?.editorPanelWidth ?? EDITOR_PANEL_DEFAULT_WIDTH,
  )
  const [editorPanelOpen, setEditorPanelOpen] = useState(() => initialDraft?.editorPanelOpen ?? false)
  const [referenceSelection, setReferenceSelection] = useState<AimEditorSelection>(EMPTY_SELECTION)
  const [draftSelection, setDraftSelection] = useState<AimEditorSelection>(EMPTY_SELECTION)

  const clearCurrentTaskContext = useCallback(() => {
    setSourceVideoCopyExtractionId(undefined)
    setSourceOriginalText("")
    setSourceAnalysisText("")
    setSourceTopicTitle("")
    setSourceTopicRationale("")
    setEditorText("")
    setEditorFormat(undefined)
    setEditorSourceMessageId(undefined)
  }, [])

  const restoreFromDraft = useCallback((nextDraft: AimDraft | null) => {
    setSourceVideoCopyExtractionId(nextDraft?.videoCopyExtractionId)
    setSourceOriginalText(nextDraft?.sourceOriginalText || "")
    setSourceAnalysisText(nextDraft?.sourceAnalysisText || "")
    setSourceTopicTitle(nextDraft?.sourceTopicTitle || "")
    setSourceTopicRationale(nextDraft?.sourceTopicRationale || "")
    setEditorText(nextDraft?.editorText || "")
    setEditorFormat(nextDraft?.editorFormat)
    setEditorSourceMessageId(nextDraft?.editorSourceMessageId)
    setEditorPanelWidth(nextDraft?.editorPanelWidth ?? EDITOR_PANEL_DEFAULT_WIDTH)
    setEditorPanelOpen(nextDraft?.editorPanelOpen ?? false)
  }, [])

  const clearSelections = useCallback(() => {
    setReferenceSelection(EMPTY_SELECTION)
    setDraftSelection(EMPTY_SELECTION)
  }, [])

  const hasEditorSelection = Boolean(referenceSelection.text.trim() || draftSelection.text.trim())
  const hasEditor = Boolean(sourceOriginalText.trim() || editorText.trim())

  return {
    sourceVideoCopyExtractionId,
    setSourceVideoCopyExtractionId,
    sourceOriginalText,
    setSourceOriginalText,
    sourceAnalysisText,
    setSourceAnalysisText,
    sourceTopicTitle,
    setSourceTopicTitle,
    sourceTopicRationale,
    setSourceTopicRationale,
    editorText,
    setEditorText,
    editorFormat,
    setEditorFormat,
    editorSourceMessageId,
    setEditorSourceMessageId,
    editorPanelWidth,
    setEditorPanelWidth,
    editorPanelOpen,
    setEditorPanelOpen,
    referenceSelection,
    setReferenceSelection,
    draftSelection,
    setDraftSelection,
    clearCurrentTaskContext,
    restoreFromDraft,
    clearSelections,
    hasEditorSelection,
    hasEditor,
  }
}
