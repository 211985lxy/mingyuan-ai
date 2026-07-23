"use client"

import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import { ApiError, chatAim, chatAimStream, polishScript, type ContentFormat } from "@/lib/api/client"
import { applySelectionReplacement, extractReplacementDraft } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { AimAgentId } from "@/lib/aim-ui-config"
import { buildOpeningRecommendationPrompt } from "@/lib/aim-opening-recommendation"
import {
  buildAimEditorContext,
  extractBenchmarkOriginalText,
  findLatestAimAssistantDraft,
  findLatestAimDeliverableText,
  getAimOpeningSegment,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { StyleGuideId } from "@/lib/style-guide-config"

type MessageSetter = Dispatch<SetStateAction<AimWorkbenchMessage[]>>
type StringSetter = Dispatch<SetStateAction<string>>
type BooleanSetter = Dispatch<SetStateAction<boolean>>

export interface AimEditorActionInput {
  messages: AimWorkbenchMessage[]
  setMessages: MessageSetter
  setInput: StringSetter
  sourceOriginalText: string
  setSourceOriginalText: StringSetter
  sourceTopicTitle: string
  editorText: string
  setEditorText: StringSetter
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  setEditorPanelOpen: BooleanSetter
  referenceSelection: AimEditorSelection
  draftSelection: AimEditorSelection
  labels: EditorPanelLabels
  agentDefaultInstruction: string
  selectedProjectId: string
  projectEnabled: boolean
  selectedAgentId: AimAgentId
  requestAbortRef: MutableRefObject<AbortController | null>
  setIsGenerating: BooleanSetter
  setIsThinking: BooleanSetter
}

function fillReferenceFromConversation(input: AimEditorActionInput) {
  const source = [...input.messages].reverse().map((message) => extractBenchmarkOriginalText(message.content)).find((content) => content.trim())
  if (!source) {
    toast.error(`当前对话里没有可识别的${input.labels.referenceTitle}`)
    return true
  }
  input.setSourceOriginalText(source)
  input.setEditorPanelOpen(true)
  input.setInput("")
  toast.success(`已填入右侧${input.labels.referenceTitle}`)
  return true
}

function integrateAssistantDraft(input: AimEditorActionInput) {
  const draft = findLatestAimAssistantDraft(input.messages)
  if (!draft) {
    toast.error(`没有找到可整合的最新版${input.labels.draftTitle}`)
    return true
  }
  input.setEditorText(draft)
  input.setEditorPanelOpen(true)
  input.setInput("")
  toast.success(`已整合到右侧${input.labels.title}`)
  return true
}

function patchDeliverableContent(
  input: AimEditorActionInput,
  content: string,
) {
  if (!input.editorSourceMessageId || !input.editorFormat) return
  input.setMessages((messages) => messages.map((message) =>
    message.id === input.editorSourceMessageId && message.deliverables
      ? {
          ...message,
          deliverables: {
            ...message.deliverables,
            results: message.deliverables.results.map((result) => result.format === input.editorFormat
              ? { ...result, content, wordCount: content.length }
              : result),
          },
        }
      : message))
}

function resolveEditorGenerationId(input: AimEditorActionInput): string | undefined {
  if (!input.editorSourceMessageId) return undefined
  return input.messages.find((message) => message.id === input.editorSourceMessageId)?.deliverables?.id
}

async function saveEditorToDeliverable(input: AimEditorActionInput): Promise<boolean> {
  if (!input.editorSourceMessageId || !input.editorFormat) {
    toast.error("当前编辑稿还没有关联交付物")
    return false
  }
  const content = input.editorText
  if (!content.trim()) {
    toast.error("正文不能为空")
    return false
  }

  const generationId = resolveEditorGenerationId(input)
  if (!generationId) {
    // 无服务端生成记录时仅回写对话态（兼容本地草稿）
    patchDeliverableContent(input, content)
    toast.success("已保存到交付物")
    return true
  }

  try {
    const response = await fetch("/api/content-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId,
        format: input.editorFormat,
        content,
        source: "manual_edit",
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(typeof payload?.error === "string" ? payload.error : "保存失败，请重试")
      return false
    }
    const savedContent = typeof payload?.data?.content === "string" ? payload.data.content : content
    patchDeliverableContent(input, savedContent)
    toast.success("已保存到交付物")
    return true
  } catch {
    toast.error("保存失败，请检查网络后重试")
    return false
  }
}

async function imitateEditorDraft(input: AimEditorActionInput, styleId: string) {
  const viralSourceText = input.sourceOriginalText.trim()
  if (viralSourceText.length < 30) return toast.error("请先在对标面板加载一条对标爆款原文")
  if (input.editorText.trim().length < 30) return toast.error("草稿太短，请先写一些你行业的方向作为仿写参考")
  const result = await polishScript({
    mode: "imitate",
    content: input.editorText,
    viralSourceText,
    persona: input.agentDefaultInstruction,
    projectId: input.selectedProjectId || undefined,
    topicTitle: input.sourceTopicTitle || undefined,
    ...(styleId !== "default" ? { styleId: styleId as StyleGuideId } : {}),
  })
  input.setEditorText(result.polished)
  toast.success("已把对标爆款的结构逻辑迁移到你的稿子")
}

function optimizeOpening(input: AimEditorActionInput, commandInput: string) {
  const sourceText = input.editorText.trim() || findLatestAimDeliverableText(input.messages)
  if (!sourceText) return toast.error("当前没有可优化的内容，请先生成脚本或写入编辑区"), true
  const { segment } = getAimOpeningSegment(sourceText)
  if (segment.length < 20) return toast.error("当前稿子太短，找不到可优化的开头"), true
  input.setIsGenerating(true)
  void chatAim([{ role: "user", content: buildOpeningRecommendationPrompt({ commandInput, openingSegment: segment, fullText: sourceText }) }], {
    agentId: "content_producer",
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
  }).then((result) => {
    const recommendations = result.content.trim()
    if (!recommendations) throw new Error("开头推荐结果为空")
    input.setEditorPanelOpen(true)
    input.setMessages((messages) => [...messages,
      { id: nextAimWorkbenchId(), role: "user", content: commandInput },
      { id: nextAimWorkbenchId(), role: "assistant", content: recommendations, agentId: "content_producer" },
    ])
    toast.success("已生成开头推荐")
  }).catch((error) => toast.error(error instanceof Error ? error.message : "开头推荐失败"))
    .finally(() => input.setIsGenerating(false))
  return true
}

function reviseCurrentDraft(input: AimEditorActionInput, commandInput: string) {
  const draft = input.editorText.trim() || findLatestAimDeliverableText(input.messages)
  if (!draft) return toast.error("当前没有可改写的稿子"), true
  const prompt = [
    "请基于当前编辑稿完成这次定向改写，只输出“修改思路 + 替换稿”。",
    "硬要求：",
    "1. 如果要结合项目资料、人设、IP故事或来时路，必须自然融入正文推进、案例、判断和身份表达里，不要单独堆履历或标签。",
    "2. 如果用户表达了“别越改越短”“保持原稿长度/体量”“不要压缩”的意思，就默认保留当前稿子的主体信息密度和篇幅，除非用户明确要求精简。",
    `3. 当前用户要求：${commandInput}`,
  ].join("\n")
  input.requestAbortRef.current?.abort()
  const controller = new AbortController()
  input.requestAbortRef.current = controller
  const assistantId = nextAimWorkbenchId()
  input.setMessages((messages) => [...messages,
    { id: nextAimWorkbenchId(), role: "user", content: commandInput },
    { id: assistantId, role: "assistant", content: "正在按当前稿子和项目资料定向改写…", agentId: input.selectedAgentId },
  ])
  input.setInput("")
  input.setIsThinking(true)
  void streamDraftRevision(input, prompt, assistantId, controller)
  return true
}

async function streamDraftRevision(input: AimEditorActionInput, prompt: string, assistantId: string, controller: AbortController) {
  try {
    await chatAimStream([...input.messages.map((message) => ({ role: message.role, content: message.content })), { role: "user", content: prompt }], {
      agentId: input.selectedAgentId,
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
      editorContext: buildAimEditorContext({ action: "口令定向改稿", referenceSelection: input.referenceSelection.text, draftSelection: input.draftSelection.text, editorText: input.editorText, labels: input.labels }),
      signal: controller.signal,
      onDelta: (_delta, content) => input.setMessages((messages) => messages.map((message) => message.id === assistantId ? { ...message, content, agentId: input.selectedAgentId } : message)),
    })
  } catch (error) {
    const stopped = controller.signal.aborted || (error instanceof ApiError && error.status === 499)
    const content = stopped ? "已停止本次改写。" : `改写失败：${error instanceof Error ? error.message : "请稍后重试"}`
    input.setMessages((messages) => messages.map((message) => message.id === assistantId ? { ...message, content, agentId: input.selectedAgentId } : message))
  } finally {
    if (input.requestAbortRef.current === controller) {
      input.requestAbortRef.current = null
      input.setIsThinking(false)
    }
  }
}

/**
 * @description React Hook：aimeditoractions
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimEditorActions(input: AimEditorActionInput) {
  const [isImitating, setIsImitating] = useState(false)
  const [isSavingEditor, setIsSavingEditor] = useState(false)
  const [imitateStyleId, setImitateStyleId] = useState("default")
  const handleImitate = () => {
    setIsImitating(true)
    void imitateEditorDraft(input, imitateStyleId)
      .catch((error) => toast.error(error instanceof Error ? error.message : "仿写失败，请重试"))
      .finally(() => setIsImitating(false))
  }
  const applyEditorReplacement = (message: AimWorkbenchMessage) => {
    const replacement = extractReplacementDraft(message.content)
    const range = message.editorApply?.range
    if (!replacement || !range) return
    input.setEditorText((current) => applySelectionReplacement(current, range, replacement))
    toast.success("已应用到右侧选区")
  }
  const applyRestoredContent = (content: string) => {
    input.setEditorText(content)
    patchDeliverableContent(input, content)
  }
  return {
    isImitating,
    isSavingEditor,
    imitateStyleId,
    setImitateStyleId,
    handleImitate,
    fillReferenceFromConversation: () => fillReferenceFromConversation(input),
    integrateAssistantDraft: () => integrateAssistantDraft(input),
    saveEditorToDeliverable: async () => {
      if (isSavingEditor) return false
      setIsSavingEditor(true)
      try {
        return await saveEditorToDeliverable(input)
      } finally {
        setIsSavingEditor(false)
      }
    },
    applyRestoredContent,
    optimizeOpening: (command: string) => optimizeOpening(input, command),
    reviseCurrentDraft: (command: string) => reviseCurrentDraft(input, command),
    applyEditorReplacement,
  }
}
