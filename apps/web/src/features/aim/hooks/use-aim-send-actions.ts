"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import {
  buildAimEditorContext,
} from "@/lib/aim/workbench-helpers"
import { shouldIsolateWritingInstruction, detectAimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import { buildSkillPrompt } from "@/features/aim/aim-skill-utils"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import type { AimWorkbenchMessage as ChatMessage, AimImageAttachment } from "@/lib/aim/workbench-types"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"

interface UseAimSendActionsOptions {
  messages: ChatMessage[]
  input: string
  hasEditorSelection: boolean
  referenceSelection: AimEditorSelection
  draftSelection: AimEditorSelection
  editorText: string
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  editorPanelLabels: ReturnType<typeof getAimEditorPanelLabels>
  imageAttachments: AimImageAttachment[]
  setInput: (value: string | ((prev: string) => string)) => void
  sendText: (text: string, options?: Record<string, unknown>) => Promise<void>
  generateWithInput: (input: string, options?: Record<string, unknown>) => Promise<string | number | undefined>
  runWorkbenchCommand: (command: import("@/lib/aim-workbench-commands").AimWorkbenchCommand) => boolean
}

/**
 * Send/generate/retry/skill actions for the AIM workbench page.
 *
 * Extracted from aim/page.tsx to decouple action dispatch from page state.
 */
/**
 * @description React Hook：aimsendactions
 * @param options - 配置选项
 * @returns 无返回值
 */
export function useAimSendActions(options: UseAimSendActionsOptions) {
  const handleUseSkill = useCallback((skill: AimWorkbenchSkill) => {
    const prompt = buildSkillPrompt(skill, {
      editorText: options.editorText,
      sourceOriginalText: options.sourceOriginalText,
      sourceAnalysisText: options.sourceAnalysisText,
      sourceTopicTitle: options.sourceTopicTitle,
      messages: options.messages,
    })
    options.setInput((current) => {
      const text = current.trim()
      return text ? `${prompt}\n\n---\n${text}\n---` : prompt
    })
    toast.success("技能指令已填入")
  }, [options])

  async function handleSend() {
    await options.sendText(options.input.trim(), options.hasEditorSelection ? {
      editorContext: buildAimEditorContext({
        action: "用户追问",
        referenceSelection: options.referenceSelection.text,
        draftSelection: options.draftSelection.text,
        editorText: options.editorText,
        labels: options.editorPanelLabels,
      }),
      editorApplyRange: options.draftSelection.text.trim() ? options.draftSelection.range : undefined,
      images: options.imageAttachments,
    } : { images: options.imageAttachments })
  }

  async function handleGenerate() {
    if (options.hasEditorSelection || options.imageAttachments.length > 0) {
      await handleSend()
      return
    }
    const currentInput = options.input.trim()
    const startsNewTask = shouldIsolateWritingInstruction(currentInput, options.messages.length > 0)
    const workbenchCommand = detectAimWorkbenchCommand(currentInput)
    if (!startsNewTask && workbenchCommand && options.runWorkbenchCommand(workbenchCommand)) return
    await options.generateWithInput(currentInput, { startsNewTask })
  }

  function retryFailedMessage(message: ChatMessage, busy: boolean) {
    if (!message.failure || busy) return
    if (message.failure.kind === "generate") {
      void options.generateWithInput(message.failure.retryText, { retryMessageId: message.id })
      return
    }
    void options.sendText(message.failure.retryText, { retryMessageId: message.id })
  }

  return { handleUseSkill, handleSend, handleGenerate, retryFailedMessage }
}
