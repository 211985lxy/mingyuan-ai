"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import type { ContentFormat } from "@/lib/api/client"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import { buildAimEditorContext } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import type { AimEditorContext } from "@/lib/aim-editor"

type SendText = (
  text: string,
  options?: {
    editorContext?: AimEditorContext
    editorApplyRange?: { start: number; end: number }
  },
) => Promise<unknown> | unknown

export function useAimInlineEditorBridge(input: {
  setMessages: Dispatch<SetStateAction<AimWorkbenchMessage[]>>
  setEditorText: Dispatch<SetStateAction<string>>
  setEditorFormat: Dispatch<SetStateAction<ContentFormat | undefined>>
  setEditorSourceMessageId: Dispatch<SetStateAction<string | undefined>>
  setDraftSelection: Dispatch<SetStateAction<AimEditorSelection>>
  editorPanelLabels: EditorPanelLabels
  sendText: SendText
}) {
  const {
    setMessages,
    setEditorText,
    setEditorFormat,
    setEditorSourceMessageId,
    setDraftSelection,
    editorPanelLabels,
    sendText,
  } = input
  const [inlineEditKey, setInlineEditKey] = useState<string | null>(null)

  const syncEditorFromResult = useCallback((messageId: string, format: ContentFormat, content: string) => {
    setEditorText((current) => (current === content ? current : content))
    setEditorFormat(format)
    setEditorSourceMessageId(messageId)
    setDraftSelection({ text: "", range: { start: 0, end: 0 } })
  }, [setDraftSelection, setEditorFormat, setEditorSourceMessageId, setEditorText])

  const handleInlineContentSaved = useCallback((messageId: string, format: ContentFormat, content: string) => {
    setMessages((messages) => messages.map((message) =>
      message.id === messageId && message.deliverables
        ? {
            ...message,
            deliverables: {
              ...message.deliverables,
              results: message.deliverables.results.map((result) =>
                result.format === format
                  ? { ...result, content, wordCount: content.length }
                  : result),
            },
          }
        : message))
    syncEditorFromResult(messageId, format, content)
  }, [setMessages, syncEditorFromResult])

  const handleInlineSelectionRewrite = useCallback((messageId: string, payload: {
    format: ContentFormat
    prompt: string
    selectionText: string
    range: { start: number; end: number }
    draftContent: string
  }) => {
    syncEditorFromResult(messageId, payload.format, payload.draftContent)
    setDraftSelection({ text: payload.selectionText, range: payload.range })
    void sendText(payload.prompt, {
      editorContext: buildAimEditorContext({
        action: "内联选区改写",
        referenceSelection: "",
        draftSelection: payload.selectionText,
        editorText: payload.draftContent,
        labels: editorPanelLabels,
      }),
      editorApplyRange: payload.range,
    })
  }, [editorPanelLabels, sendText, setDraftSelection, syncEditorFromResult])

  return {
    inlineEditKey,
    setInlineEditKey,
    syncEditorFromResult,
    handleInlineContentSaved,
    handleInlineSelectionRewrite,
  }
}
