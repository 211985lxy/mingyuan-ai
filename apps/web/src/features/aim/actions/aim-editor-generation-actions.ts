import { toast } from "sonner"
import { ApiError, chatAim, chatAimStream } from "@/lib/api/client"
import { buildOpeningRecommendationPrompt } from "@/lib/aim-opening-recommendation"
import { getLatestDeliverableText, getOpeningSegment } from "@/features/aim/aim-command-utils"
import { nextAimMessageId } from "@/features/aim/aim-id"
import type { AimEditorActionsOptions } from "@/features/aim/hooks/aim-editor-action-contracts"
import type { AimEditorContext } from "@/lib/aim-editor"

/**
 * @description 创建aimopeningaction
 * @param options - 配置选项
 * @returns 无返回值
 */
export function createAimOpeningAction(options: AimEditorActionsOptions) {
  function handleOptimizeOpening(commandInput: string) {
    const sourceText = options.editorText.trim() || getLatestDeliverableText(options.messages)
    if (!sourceText) {
      toast.error("当前没有可优化的内容，请先生成脚本或写入编辑区")
      return true
    }
    const { segment } = getOpeningSegment(sourceText)
    if (segment.length < 20) {
      toast.error("当前稿子太短，找不到可优化的开头")
      return true
    }

    options.setIsGenerating(true)
    void chatAim([{ role: "user", content: buildOpeningRecommendationPrompt({ commandInput, openingSegment: segment, fullText: sourceText }) }], {
      agentId: "content_producer",
      projectId: options.projectEnabled ? options.selectedProjectId || undefined : undefined,
    }).then((result) => {
      const content = result.content.trim()
      if (!content) throw new Error("开头推荐结果为空")
      options.setEditorPanelOpen(true)
      options.setMessages((current) => [...current,
        { id: nextAimMessageId(), role: "user", content: commandInput },
        { id: nextAimMessageId(), role: "assistant", content, agentId: "content_producer" },
      ])
      toast.success("已生成开头推荐")
    }).catch((error) => toast.error(error instanceof Error ? error.message : "开头推荐失败"))
      .finally(() => options.setIsGenerating(false))
    return true
  }

  return handleOptimizeOpening
}

/**
 * @description 创建aimdraftrevisionaction
 * @param options - 配置选项
 * @param buildEditorContext - buildEditor上下文
 * @returns 无返回值
 */
export function createAimDraftRevisionAction(options: AimEditorActionsOptions, buildEditorContext: (action: string) => AimEditorContext) {
  function handleReviseCurrentDraft(commandInput: string) {
    const draft = options.editorText.trim() || getLatestDeliverableText(options.messages)
    if (!draft) {
      toast.error("当前没有可改写的稿子")
      return true
    }
    const prompt = [
      "请基于当前编辑稿完成这次定向改写，只输出“修改思路 + 替换稿”。",
      "硬要求：",
      "1. 如果要结合项目资料、人设、IP故事或来时路，必须自然融入正文推进、案例、判断和身份表达里，不要单独堆履历或标签。",
      "2. 如果用户表达了“别越改越短”“保持原稿长度/体量”“不要压缩”的意思，就默认保留当前稿子的主体信息密度和篇幅，除非用户明确要求精简。",
      `3. 当前用户要求：${commandInput}`,
    ].join("\n")
    const controller = new AbortController()
    options.requestAbortRef.current?.abort()
    options.requestAbortRef.current = controller
    const assistantId = nextAimMessageId()
    options.setMessages((current) => [...current,
      { id: nextAimMessageId(), role: "user", content: commandInput },
      { id: assistantId, role: "assistant", content: "正在按当前稿子和项目资料定向改写…", agentId: options.selectedAgentId },
    ])
    options.setInput("")
    options.setIsThinking(true)
    void chatAimStream([...options.messages.map((message) => ({ role: message.role, content: message.content })), { role: "user", content: prompt }], {
      agentId: options.selectedAgentId,
      projectId: options.projectEnabled ? options.selectedProjectId || undefined : undefined,
      editorContext: buildEditorContext("口令定向改稿"),
      signal: controller.signal,
      onDelta: (_delta, content) => options.setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content, agentId: options.selectedAgentId } : message)),
    }).catch((error) => {
      const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
      const content = stopped ? "已停止本次改写。" : `改写失败：${error instanceof Error ? error.message : "请稍后重试"}`
      options.setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content, agentId: options.selectedAgentId } : message))
    }).finally(() => {
      if (options.requestAbortRef.current === controller) {
        options.requestAbortRef.current = null
        options.setIsThinking(false)
      }
    })
    return true
  }

  return handleReviseCurrentDraft
}
