"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"
import type { ContentFormat } from "@/lib/api/client"
import { isValidAimAgent } from "@/lib/aim-ui-config"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import { buildAimEditorContext } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import type { AimEditorContext } from "@/lib/aim-editor"
import {
  reportWebFinalDisposition,
  reportWebRunEdited,
  resolveRunWorkflowId,
} from "@/lib/aim/run-outcome-client"

type SendText = (
  text: string,
  options?: {
    editorContext?: AimEditorContext
    editorApplyRange?: { start: number; end: number }
  },
) => Promise<unknown> | unknown

function findRunTelemetry(messages: AimWorkbenchMessage[], messageId: string) {
  const message = messages.find((item) => item.id === messageId)
  if (!message?.runId || !isValidAimAgent(message.agentId)) return null
  return {
    runId: message.runId,
    workflowId: resolveRunWorkflowId(message.agentId),
    taskType: message.contentAction ?? "generation",
  }
}

async function reportInlineEditTelemetry(
  telemetry: ReturnType<typeof findRunTelemetry>,
) {
  if (!telemetry) return
  try {
    await reportWebRunEdited(telemetry)
  } catch {
    toast.error("内容已保存，但编辑遥测记录失败，请稍后重试")
  }
}

async function reportInlineRewriteTelemetry(
  telemetry: ReturnType<typeof findRunTelemetry>,
) {
  if (!telemetry) return
  try {
    await reportWebFinalDisposition({ ...telemetry, finalDisposition: "rewrite_requested" })
  } catch {
    toast.error("重写将继续，但经营结果记录失败，请稍后重试")
  }
}

export function useAimInlineEditorBridge(input: {
  messages: AimWorkbenchMessage[]
  setMessages: Dispatch<SetStateAction<AimWorkbenchMessage[]>>
  setEditorText: Dispatch<SetStateAction<string>>
  setEditorFormat: Dispatch<SetStateAction<ContentFormat | undefined>>
  setEditorSourceMessageId: Dispatch<SetStateAction<string | undefined>>
  setDraftSelection: Dispatch<SetStateAction<AimEditorSelection>>
  editorPanelLabels: EditorPanelLabels
  sendText: SendText
}) {
  const {
    messages,
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

  const handleInlineContentSaved = useCallback(async (messageId: string, format: ContentFormat, content: string) => {
    const telemetry = findRunTelemetry(messages, messageId)
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
    await reportInlineEditTelemetry(telemetry)
  }, [messages, setMessages, syncEditorFromResult])

  const handleInlineSelectionRewrite = useCallback(async (messageId: string, payload: {
    format: ContentFormat
    prompt: string
    selectionText: string
    range: { start: number; end: number }
    draftContent: string
  }) => {
    const telemetry = findRunTelemetry(messages, messageId)
    syncEditorFromResult(messageId, payload.format, payload.draftContent)
    setDraftSelection({ text: payload.selectionText, range: payload.range })
    await reportInlineRewriteTelemetry(telemetry)
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
  }, [editorPanelLabels, messages, sendText, setDraftSelection, syncEditorFromResult])

  return {
    inlineEditKey,
    setInlineEditKey,
    syncEditorFromResult,
    handleInlineContentSaved,
    handleInlineSelectionRewrite,
  }
}
