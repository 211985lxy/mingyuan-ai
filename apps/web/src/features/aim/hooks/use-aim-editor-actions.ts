"use client"

import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import { chatAim, chatAimStream, polishScript, ApiError, type ContentFormat } from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { StyleGuideId } from "@/lib/style-guide-config"
import { buildOpeningRecommendationPrompt } from "@/lib/aim-opening-recommendation"
import {
  applySelectionReplacement,
  extractEditorDraftFromAssistantText,
  extractReplacementDraft,
  type AimEditorContext,
  type TextSelectionRange,
} from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { AimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"
import { nextAimMessageId } from "@/features/aim/aim-id"
import {
  buildBenchmarkQualityMessage,
  buildBenchmarkRewriteInput,
  getLatestDeliverableMessageId,
  getLatestDeliverableText,
  getOpeningSegment,
} from "@/features/aim/aim-command-utils"
import { extractBenchmarkOriginalText } from "@/features/aim/aim-text-utils"

interface EditorSelectionState {
  text: string
  range: TextSelectionRange
}

interface EditorAgent {
  defaultInstruction: string
}

interface UseAimEditorActionsOptions {
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  messages: ChatMessage[]
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  editorText: string
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  referenceSelection: EditorSelectionState
  draftSelection: EditorSelectionState
  editorPanelLabels: EditorPanelLabels
  agent: EditorAgent
  requestAbortRef: MutableRefObject<AbortController | null>
  generateWithInput: (input: string) => void | Promise<void>
  handleQuality: (messageId: string) => () => Promise<void>
  resetConversation: () => void
  rememberWorkbenchPreference: (preference: string) => void
  setInput: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setEditorText: Dispatch<SetStateAction<string>>
  setEditorPanelOpen: Dispatch<SetStateAction<boolean>>
  setSourceOriginalText: Dispatch<SetStateAction<string>>
  setIsGenerating: Dispatch<SetStateAction<boolean>>
  setIsThinking: Dispatch<SetStateAction<boolean>>
}

export function useAimEditorActions({
  selectedAgentId,
  selectedProjectId,
  projectEnabled,
  messages,
  sourceOriginalText,
  sourceAnalysisText,
  sourceTopicTitle,
  editorText,
  editorFormat,
  editorSourceMessageId,
  referenceSelection,
  draftSelection,
  editorPanelLabels,
  agent,
  requestAbortRef,
  generateWithInput,
  handleQuality,
  resetConversation,
  rememberWorkbenchPreference,
  setInput,
  setMessages,
  setEditorText,
  setEditorPanelOpen,
  setSourceOriginalText,
  setIsGenerating,
  setIsThinking,
}: UseAimEditorActionsOptions) {
  const [isImitating, setIsImitating] = useState(false)
  const [imitateStyleId, setImitateStyleId] = useState("default")

  function fillReferenceTextFromConversation() {
    const source = [...messages]
      .reverse()
      .map((message) => extractBenchmarkOriginalText(message.content))
      .find((content) => content.trim())
    if (!source) {
      toast.error(`当前对话里没有可识别的${editorPanelLabels.referenceTitle}`)
      return true
    }
    setSourceOriginalText(source)
    setEditorPanelOpen(true)
    setInput("")
    toast.success(`已填入右侧${editorPanelLabels.referenceTitle}`)
    return true
  }

  function integrateLatestAssistantDraftToEditor() {
    const draft = [...messages]
      .reverse()
      .filter((message) => message.role === "assistant")
      .map((message) => extractEditorDraftFromAssistantText(message.content))
      .find((content) => content.trim())

    if (!draft) {
      toast.error(`没有找到可整合的最新版${editorPanelLabels.draftTitle}`)
      return true
    }

    setEditorText(draft)
    setEditorPanelOpen(true)
    setInput("")
    toast.success(`已整合到右侧${editorPanelLabels.title}`)
    return true
  }

  function handleImitate() {
    const viralSourceText = sourceOriginalText.trim()
    if (viralSourceText.length < 30) {
      toast.error("请先在对标面板加载一条对标爆款原文")
      return
    }
    if (editorText.trim().length < 30) {
      toast.error("草稿太短，请先写一些你行业的方向作为仿写参考")
      return
    }
    setIsImitating(true)
    void polishScript({
      mode: "imitate",
      content: editorText,
      viralSourceText,
      persona: agent.defaultInstruction,
      projectId: selectedProjectId || undefined,
      topicTitle: sourceTopicTitle || undefined,
      ...(imitateStyleId !== "default" ? { styleId: imitateStyleId as StyleGuideId } : {}),
    })
      .then((result) => {
        setEditorText(result.polished)
        toast.success("已把对标爆款的结构逻辑迁移到你的稿子")
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "仿写失败，请重试")
      })
      .finally(() => setIsImitating(false))
  }

  function saveEditorToDeliverable() {
    if (!editorSourceMessageId || !editorFormat) {
      toast.error("当前编辑稿还没有关联交付物")
      return false
    }
    setMessages((prev) =>
      prev.map((message) =>
        message.id === editorSourceMessageId && message.deliverables
          ? {
              ...message,
              deliverables: {
                ...message.deliverables,
                results: message.deliverables.results.map((result) =>
                  result.format === editorFormat
                    ? { ...result, content: editorText, wordCount: editorText.length }
                    : result
                ),
              },
            }
          : message
      )
    )
    toast.success("已保存到交付物")
    return true
  }

  function buildEditorContext(action: string): AimEditorContext {
    return {
      action,
      referenceSelection: referenceSelection.text.trim() || undefined,
      draftSelection: draftSelection.text.trim() || undefined,
      draftText: editorText.trim() || undefined,
      documentType: editorPanelLabels.documentType,
      referenceLabel: editorPanelLabels.referenceTitle,
      draftLabel: editorPanelLabels.draftTitle,
    }
  }

  function handleOptimizeOpening(commandInput: string) {
    const sourceText = editorText.trim() || getLatestDeliverableText(messages)
    if (!sourceText) {
      toast.error("当前没有可优化的内容，请先生成脚本或写入编辑区")
      return true
    }
    const { segment } = getOpeningSegment(sourceText)
    if (segment.length < 20) {
      toast.error("当前稿子太短，找不到可优化的开头")
      return true
    }

    setIsGenerating(true)
    void chatAim([
      {
        role: "user",
        content: buildOpeningRecommendationPrompt({
          commandInput,
          openingSegment: segment,
          fullText: sourceText,
        }),
      },
    ], {
      agentId: "content_producer",
      projectId: projectEnabled ? selectedProjectId || undefined : undefined,
    })
      .then((result) => {
        const recommendations = result.content.trim()
        if (!recommendations) throw new Error("开头推荐结果为空")
        setEditorPanelOpen(true)
        setMessages((prev) => [
          ...prev,
          {
            id: nextAimMessageId(),
            role: "user",
            content: commandInput,
          },
          {
            id: nextAimMessageId(),
            role: "assistant",
            content: recommendations,
            agentId: "content_producer",
          },
        ])
        toast.success("已生成开头推荐")
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "开头推荐失败")
      })
      .finally(() => setIsGenerating(false))

    return true
  }

  function handleReviseCurrentDraft(commandInput: string) {
    const draft = editorText.trim() || getLatestDeliverableText(messages)
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
    requestAbortRef.current = controller
    const assistantId = nextAimMessageId()
    setMessages((prev) => [
      ...prev,
      { id: nextAimMessageId(), role: "user", content: commandInput },
      {
        id: assistantId,
        role: "assistant",
        content: "正在按当前稿子和项目资料定向改写…",
        agentId: selectedAgentId,
      },
    ])
    setInput("")
    setIsThinking(true)

    void chatAimStream([
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: prompt },
    ], {
      agentId: selectedAgentId,
      projectId: projectEnabled ? selectedProjectId || undefined : undefined,
      editorContext: buildEditorContext("口令定向改稿"),
      signal: controller.signal,
      onDelta: (_delta, content) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content, agentId: selectedAgentId } : message
          )
        )
      },
    })
      .catch((error) => {
        const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
        const content = stopped ? "已停止本次改写。" : `改写失败：${error instanceof Error ? error.message : "请稍后重试"}`
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content, agentId: selectedAgentId } : message
          )
        )
      })
      .finally(() => {
        if (requestAbortRef.current === controller) requestAbortRef.current = null
        setIsThinking(false)
      })

    return true
  }

  function runWorkbenchCommand(command: AimWorkbenchCommand) {
    setInput("")

    if (command.id === "integrate_editor") return integrateLatestAssistantDraftToEditor()
    if (command.id === "fill_reference") return fillReferenceTextFromConversation()
    if (command.id === "open_editor") {
      setEditorPanelOpen(true)
      toast.success(`已打开右侧${editorPanelLabels.title}`)
      return true
    }
    if (command.id === "close_editor") {
      setEditorPanelOpen(false)
      toast.success(`已隐藏右侧${editorPanelLabels.title}`)
      return true
    }
    if (command.id === "save_editor") return saveEditorToDeliverable()
    if (command.id === "reset_conversation") {
      resetConversation()
      toast.success("已清空当前对话")
      return true
    }
    if (command.id === "regenerate") {
      void generateWithInput("")
      return true
    }
    if (command.id === "revise_current_draft") return handleReviseCurrentDraft(command.input)
    if (command.id === "optimize_opening") return handleOptimizeOpening(command.input)
    if (command.id === "rewrite_benchmark") {
      const rewriteInput = buildBenchmarkRewriteInput({
        sourceOriginalText,
        messages,
        sourceAnalysisText,
        currentDraft: editorText.trim() || getLatestDeliverableText(messages),
      })
      if (rewriteInput) void generateWithInput(rewriteInput)
      return true
    }
    if (command.id === "run_quality_check") {
      const localCheckMessage = buildBenchmarkQualityMessage({
        sourceOriginalText,
        messages,
        draft: editorText.trim() || getLatestDeliverableText(messages),
      })
      const messageId = getLatestDeliverableMessageId(messages)
      if (localCheckMessage) {
        setMessages((prev) => [...prev, { id: nextAimMessageId(), role: "assistant", content: localCheckMessage }])
      }
      if (messageId) {
        void handleQuality(messageId)()
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
      rememberWorkbenchPreference(command.input)
      return true
    }
    return false
  }

  function applyEditorReplacement(message: ChatMessage) {
    const replacement = extractReplacementDraft(message.content)
    const range = message.editorApply?.range
    if (!replacement || !range) return
    setEditorText((current) => applySelectionReplacement(current, range, replacement))
    toast.success("已应用到右侧选区")
  }

  return {
    isImitating,
    imitateStyleId,
    setImitateStyleId,
    handleImitate,
    saveEditorToDeliverable,
    runWorkbenchCommand,
    buildEditorContext,
    applyEditorReplacement,
  }
}
