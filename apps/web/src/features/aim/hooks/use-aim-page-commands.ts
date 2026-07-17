"use client"

import { toast } from "sonner"
import {
  buildAimBenchmarkQualityMessage,
  buildAimBenchmarkRewriteInput,
  findLatestAimVideoDeliverableMessageId,
  nextAimWorkbenchId as nextId,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage as ChatMessage } from "@/lib/aim/workbench-types"
import {
  type AimWorkbenchCommand,
} from "@/lib/aim-workbench-commands"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"

interface UseAimPageCommandsOptions {
  messages: ChatMessage[]
  sourceOriginalText: string
  sourceAnalysisText: string
  editorText: string
  editorPanelLabels: ReturnType<typeof getAimEditorPanelLabels>
  setInput: (value: string) => void
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
  setEditorPanelOpen: (open: boolean) => void
  resetConversation: () => void
  generateWithInput: (input: string, options?: Record<string, unknown>) => Promise<string | number | undefined>
  handleQuality: (messageId: string) => () => Promise<void>
  integrateLatestAssistantDraftToEditor: () => boolean
  fillReferenceTextFromConversation: () => boolean
  saveEditorToDeliverable: () => boolean
  handleReviseCurrentDraft: (input: string) => boolean
  handleOptimizeOpening: (input: string) => boolean
  rememberWorkbenchPreference: (input: string) => void
}

/**
 * Workbench command dispatcher for the AIM page.
 *
 * Routes slash-commands and structured actions to the appropriate handler.
 * Extracted from aim/page.tsx to reduce page complexity.
 */
export function useAimPageCommands(options: UseAimPageCommandsOptions) {
  function runWorkbenchCommand(command: AimWorkbenchCommand) {
    options.setInput("")

    if (command.id === "integrate_editor") return options.integrateLatestAssistantDraftToEditor()
    if (command.id === "fill_reference") return options.fillReferenceTextFromConversation()
    if (command.id === "open_editor") {
      options.setEditorPanelOpen(true)
      toast.success(`已打开右侧${options.editorPanelLabels.title}`)
      return true
    }
    if (command.id === "close_editor") {
      options.setEditorPanelOpen(false)
      toast.success(`已隐藏右侧${options.editorPanelLabels.title}`)
      return true
    }
    if (command.id === "save_editor") return options.saveEditorToDeliverable()
    if (command.id === "reset_conversation") {
      options.resetConversation()
      toast.success("已清空当前对话")
      return true
    }
    if (command.id === "regenerate") {
      void options.generateWithInput("")
      return true
    }
    if (command.id === "revise_current_draft") return options.handleReviseCurrentDraft(command.input)
    if (command.id === "optimize_opening") return options.handleOptimizeOpening(command.input)
    if (command.id === "rewrite_benchmark") {
      const rewriteInput = buildAimBenchmarkRewriteInput({
        messages: options.messages,
        sourceOriginalText: options.sourceOriginalText,
        sourceAnalysisText: options.sourceAnalysisText,
        editorText: options.editorText,
      })
      if (!rewriteInput) toast.error("请先带入对标原文")
      if (rewriteInput) void options.generateWithInput(rewriteInput)
      return true
    }
    if (command.id === "run_quality_check") {
      const localCheckMessage = buildAimBenchmarkQualityMessage({ messages: options.messages, sourceOriginalText: options.sourceOriginalText, editorText: options.editorText })
      const messageId = findLatestAimVideoDeliverableMessageId(options.messages)
      if (localCheckMessage) {
        options.setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: localCheckMessage }])
      }
      if (messageId) {
        void options.handleQuality(messageId)()
        toast.success(localCheckMessage ? "已完成对标自检，并开始脚本质检" : "已开始脚本质检")
        return true
      }
      if (localCheckMessage) {
        toast.success("对标自检完成")
        return true
      }
      toast.error("当前没有可质检的生成结果")
      return true
    }
    if (command.id === "remember_preference") {
      options.rememberWorkbenchPreference(command.input)
      return true
    }
    return false
  }

  return { runWorkbenchCommand }
}
