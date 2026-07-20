import { toast } from "sonner"
import type { AimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import { buildBenchmarkQualityMessage, buildBenchmarkRewriteInput, getLatestDeliverableMessageId, getLatestDeliverableText } from "@/features/aim/aim-command-utils"
import { nextAimMessageId } from "@/features/aim/aim-id"
import type { AimEditorActionsOptions } from "@/features/aim/hooks/aim-editor-action-contracts"

interface CommandCallbacks {
  integrateEditor: () => boolean
  fillReference: () => boolean
  saveEditor: () => boolean
  reviseDraft: (input: string) => boolean
  optimizeOpening: (input: string) => boolean
}

/**
 * @description 创建aimworkbenchcommandrunner
 * @param options - 配置选项
 * @param callbacks - callbacks
 * @returns 无返回值
 */
export function createAimWorkbenchCommandRunner(options: AimEditorActionsOptions, callbacks: CommandCallbacks) {
  function runWorkbenchCommand(command: AimWorkbenchCommand) {
    options.setInput("")
    if (command.id === "integrate_editor") return callbacks.integrateEditor()
    if (command.id === "fill_reference") return callbacks.fillReference()
    if (command.id === "open_editor" || command.id === "close_editor") {
      const open = command.id === "open_editor"
      options.setEditorPanelOpen(open)
      toast.success(`已${open ? "打开" : "隐藏"}右侧${options.editorPanelLabels.title}`)
      return true
    }
    if (command.id === "save_editor") return callbacks.saveEditor()
    if (command.id === "reset_conversation") {
      options.resetConversation()
      toast.success("已清空当前对话")
      return true
    }
    if (command.id === "regenerate") {
      void options.generateWithInput("")
      return true
    }
    if (command.id === "revise_current_draft") return callbacks.reviseDraft(command.input)
    if (command.id === "optimize_opening") return callbacks.optimizeOpening(command.input)
    if (command.id === "rewrite_benchmark") {
      const input = buildBenchmarkRewriteInput({
        sourceOriginalText: options.sourceOriginalText,
        messages: options.messages,
        sourceAnalysisText: options.sourceAnalysisText,
        currentDraft: options.editorText.trim() || getLatestDeliverableText(options.messages),
      })
      if (input) void options.generateWithInput(input)
      return true
    }
    if (command.id === "run_quality_check") return runQualityCheck(options)
    if (command.id === "remember_preference") {
      options.rememberWorkbenchPreference(command.input)
      return true
    }
    return false
  }

  return runWorkbenchCommand
}

function runQualityCheck(options: AimEditorActionsOptions) {
  const message = buildBenchmarkQualityMessage({
    sourceOriginalText: options.sourceOriginalText,
    messages: options.messages,
    draft: options.editorText.trim() || getLatestDeliverableText(options.messages),
  })
  const messageId = getLatestDeliverableMessageId(options.messages)
  if (message) options.setMessages((current) => [...current, { id: nextAimMessageId(), role: "assistant", content: message }])
  if (messageId) {
    void options.handleQuality(messageId)()
    toast.success(message ? "已完成对标自检，并开始脚本质检" : "已开始脚本质检")
    return true
  }
  if (message) {
    toast.success("对标自检完成")
    return true
  }
  toast.error("当前没有可质检的生成结果")
  return true
}
