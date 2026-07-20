import { toast } from "sonner"
import { extractEditorDraftFromAssistantText } from "@/lib/aim-editor"
import { extractBenchmarkOriginalText } from "@/features/aim/aim-text-utils"
import type { AimEditorActionsOptions } from "@/features/aim/hooks/aim-editor-action-contracts"

/**
 * @description 创建aimeditortransferactions
 * @param options - 配置选项
 * @returns 无返回值
 */
export function createAimEditorTransferActions(options: AimEditorActionsOptions) {
  function fillReferenceTextFromConversation() {
    const source = [...options.messages].reverse().map((message) => extractBenchmarkOriginalText(message.content)).find((content) => content.trim())
    if (!source) {
      toast.error(`当前对话里没有可识别的${options.editorPanelLabels.referenceTitle}`)
      return true
    }
    options.setSourceOriginalText(source)
    options.setEditorPanelOpen(true)
    options.setInput("")
    toast.success(`已填入右侧${options.editorPanelLabels.referenceTitle}`)
    return true
  }

  function integrateLatestAssistantDraftToEditor() {
    const draft = [...options.messages].reverse().filter((message) => message.role === "assistant").map((message) => extractEditorDraftFromAssistantText(message.content)).find((content) => content.trim())
    if (!draft) {
      toast.error(`没有找到可整合的最新版${options.editorPanelLabels.draftTitle}`)
      return true
    }
    options.setEditorText(draft)
    options.setEditorPanelOpen(true)
    options.setInput("")
    toast.success(`已整合到右侧${options.editorPanelLabels.title}`)
    return true
  }

  function saveEditorToDeliverable() {
    if (!options.editorSourceMessageId || !options.editorFormat) {
      toast.error("当前编辑稿还没有关联交付物")
      return false
    }
    options.setMessages((current) => current.map((message) => message.id === options.editorSourceMessageId && message.deliverables ? {
      ...message,
      deliverables: {
        ...message.deliverables,
        results: message.deliverables.results.map((result) => result.format === options.editorFormat ? { ...result, content: options.editorText, wordCount: options.editorText.length } : result),
      },
    } : message))
    toast.success("已保存到交付物")
    return true
  }

  return { fillReferenceTextFromConversation, integrateLatestAssistantDraftToEditor, saveEditorToDeliverable }
}
