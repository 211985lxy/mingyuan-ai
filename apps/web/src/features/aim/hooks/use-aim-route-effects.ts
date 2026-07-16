"use client"

import { startTransition, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import { loadAimDraft, saveAimDraft } from "@/features/aim/aim-draft-storage"
import { nextAimMessageId } from "@/features/aim/aim-id"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"
import {
  getHistoryContents,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  formatAnalysisResultForPrompt,
} from "@/features/aim/aim-text-utils"
import {
  BENCHMARK_RECREATION_PREFILL,
  buildBenchmarkLengthRule,
  buildBenchmarkRecreationSopBlock,
} from "@/lib/aim-benchmark-length"
import { getVideoCopyExtraction, type AimGenerateResponse, type AimGeneration, type ContentFormat } from "@/lib/api/client"
import { DEFAULT_AIM_AGENT, isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import { EDITOR_PANEL_DEFAULT_WIDTH } from "@/lib/aim-editor"

interface UseAimRouteEffectsOptions {
  activeAgentId: AimAgentId
  agentParam: string | null
  searchParams: URLSearchParams
  topicTitleParam: string | null
  topicRationaleParam: string | null
  projectIdParam: string | null
  ideaParam: string | null
  videoCopyExtractionIdParam: string | null
  loadTargetId: string | null
  storeHistory: AimGeneration[]
  selectedAgentId: AimAgentId
  selectedProjectId: string
  input: string
  messages: ChatMessage[]
  sourceVideoCopyExtractionId?: string
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  sourceTopicRationale: string
  editorText: string
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  editorPanelWidth: number
  editorPanelOpen: boolean
  lastAgentParamRef: MutableRefObject<string | null>
  replaceAimUrl: (url: string) => void
  clearLoadTarget: () => void
  openEditorFromResult: (messageId: string, format: ContentFormat, content: string) => void
  setSelectedAgentId: Dispatch<SetStateAction<AimAgentId>>
  setSelectedProjectId: Dispatch<SetStateAction<string>>
  setInput: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setSourceVideoCopyExtractionId: Dispatch<SetStateAction<string | undefined>>
  setSourceOriginalText: Dispatch<SetStateAction<string>>
  setSourceAnalysisText: Dispatch<SetStateAction<string>>
  setSourceTopicTitle: Dispatch<SetStateAction<string>>
  setSourceTopicRationale: Dispatch<SetStateAction<string>>
  setEditorText: Dispatch<SetStateAction<string>>
  setEditorFormat: Dispatch<SetStateAction<ContentFormat | undefined>>
  setEditorSourceMessageId: Dispatch<SetStateAction<string | undefined>>
  setEditorPanelWidth: Dispatch<SetStateAction<number>>
  setEditorPanelOpen: Dispatch<SetStateAction<boolean>>
}

export function useAimRouteEffects({
  activeAgentId,
  agentParam,
  searchParams,
  topicTitleParam,
  topicRationaleParam,
  projectIdParam,
  ideaParam,
  videoCopyExtractionIdParam,
  loadTargetId,
  storeHistory,
  selectedAgentId,
  selectedProjectId,
  input,
  messages,
  sourceVideoCopyExtractionId,
  sourceOriginalText,
  sourceAnalysisText,
  sourceTopicTitle,
  sourceTopicRationale,
  editorText,
  editorFormat,
  editorSourceMessageId,
  editorPanelWidth,
  editorPanelOpen,
  lastAgentParamRef,
  replaceAimUrl,
  clearLoadTarget,
  openEditorFromResult,
  setSelectedAgentId,
  setSelectedProjectId,
  setInput,
  setMessages,
  setSourceVideoCopyExtractionId,
  setSourceOriginalText,
  setSourceAnalysisText,
  setSourceTopicTitle,
  setSourceTopicRationale,
  setEditorText,
  setEditorFormat,
  setEditorSourceMessageId,
  setEditorPanelWidth,
  setEditorPanelOpen,
}: UseAimRouteEffectsOptions) {
  useEffect(() => {
    saveAimDraft({
      selectedAgentId,
      selectedProjectId,
      input,
      messages,
      videoCopyExtractionId: sourceVideoCopyExtractionId,
      sourceOriginalText,
      sourceAnalysisText,
      sourceTopicTitle,
      sourceTopicRationale,
      editorText,
      editorFormat,
      editorSourceMessageId,
      editorPanelWidth,
      editorPanelOpen,
    })
  }, [
    editorFormat,
    editorPanelOpen,
    editorPanelWidth,
    editorSourceMessageId,
    editorText,
    input,
    messages,
    selectedAgentId,
    selectedProjectId,
    sourceOriginalText,
    sourceAnalysisText,
    sourceTopicTitle,
    sourceTopicRationale,
    sourceVideoCopyExtractionId,
  ])

  useEffect(() => {
    if (!sourceVideoCopyExtractionId || (sourceOriginalText.trim() && sourceAnalysisText.trim())) return
    getVideoCopyExtraction(sourceVideoCopyExtractionId)
      .then((record) => {
        const analysisText = formatAnalysisResultForPrompt(record.analysisResult) || ""
        if (!sourceOriginalText.trim()) setSourceOriginalText(record.transcript || "")
        if (!sourceAnalysisText.trim()) setSourceAnalysisText(analysisText)
      })
      .catch(() => {})
  }, [setSourceAnalysisText, setSourceOriginalText, sourceAnalysisText, sourceOriginalText, sourceVideoCopyExtractionId])

  useEffect(() => {
    if (lastAgentParamRef.current === agentParam) return
    lastAgentParamRef.current = agentParam
    const nextDraft = loadAimDraft(activeAgentId)
    startTransition(() => {
      setSelectedAgentId(activeAgentId)
      setSelectedProjectId(nextDraft?.selectedProjectId || selectedProjectId)
      setMessages(nextDraft?.messages || [])
      setInput(nextDraft?.input || "")
      setSourceVideoCopyExtractionId(nextDraft?.videoCopyExtractionId)
      setSourceOriginalText(nextDraft?.sourceOriginalText || "")
      setSourceAnalysisText(nextDraft?.sourceAnalysisText || "")
      setSourceTopicTitle(nextDraft?.sourceTopicTitle || "")
      setSourceTopicRationale(nextDraft?.sourceTopicRationale || "")
      setEditorText(nextDraft?.editorText || "")
      setEditorFormat(nextDraft?.editorFormat)
      setEditorSourceMessageId(nextDraft?.editorSourceMessageId)
      setEditorPanelWidth(nextDraft?.editorPanelWidth ?? EDITOR_PANEL_DEFAULT_WIDTH)
      setEditorPanelOpen(nextDraft?.editorPanelOpen ?? true)
    })
  }, [
    activeAgentId,
    agentParam,
    lastAgentParamRef,
    selectedProjectId,
    setEditorFormat,
    setEditorPanelOpen,
    setEditorPanelWidth,
    setEditorSourceMessageId,
    setEditorText,
    setInput,
    setMessages,
    setSelectedAgentId,
    setSelectedProjectId,
    setSourceAnalysisText,
    setSourceOriginalText,
    setSourceTopicRationale,
    setSourceTopicTitle,
    setSourceVideoCopyExtractionId,
  ])

  useEffect(() => {
    if (!topicTitleParam && !topicRationaleParam && !projectIdParam && !ideaParam) return

    const prefillLines = [
      topicTitleParam ? `选题：${topicTitleParam}` : null,
      topicRationaleParam ? `选题依据：${topicRationaleParam}` : null,
      ideaParam ? `创作灵感：${ideaParam}` : null,
    ].filter(Boolean)

    startTransition(() => {
      if (projectIdParam) setSelectedProjectId(projectIdParam)
      setMessages([])
      setInput(prefillLines.join("\n"))
      setSourceTopicTitle(topicTitleParam || ideaParam || "")
      setSourceTopicRationale(topicRationaleParam || "")
      setSourceVideoCopyExtractionId(undefined)
      setSourceOriginalText("")
      setSourceAnalysisText("")
      setEditorText("")
      setEditorFormat(undefined)
      setEditorSourceMessageId(undefined)
    })

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("topicTitle")
    nextParams.delete("topicRationale")
    nextParams.delete("projectId")
    nextParams.delete("idea")
    replaceAimUrl(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim")
  }, [
    ideaParam,
    projectIdParam,
    replaceAimUrl,
    searchParams,
    setEditorFormat,
    setEditorSourceMessageId,
    setEditorText,
    setInput,
    setMessages,
    setSelectedProjectId,
    setSourceAnalysisText,
    setSourceOriginalText,
    setSourceTopicRationale,
    setSourceTopicTitle,
    setSourceVideoCopyExtractionId,
    topicRationaleParam,
    topicTitleParam,
  ])

  useEffect(() => {
    if (!videoCopyExtractionIdParam) return

    getVideoCopyExtraction(videoCopyExtractionIdParam)
      .then((record) => {
        const lengthRule = buildBenchmarkLengthRule(record.transcript)
        const recreationSop = buildBenchmarkRecreationSopBlock()
        const prefill = [
          BENCHMARK_RECREATION_PREFILL.short,
          "",
          "创作原则：",
          recreationSop,
          "1. 开头机制可以借，但第一句话必须重写成我的身份和业务场景里的话。",
          "2. 结构节奏可以保留，但表达至少 30% 可感知重写：案例、转折、句式和行动引导不能贴原文。",
          "3. 除专有名词外，不要连续沿用原文 12 个字以上，最终稿要像我的内容，不像原文换皮。",
          lengthRule ? `4. ${lengthRule}` : null,
          "",
          record.videoTitle ? `对标标题：${record.videoTitle}` : null,
          "对标原文：",
          record.transcript || "",
          record.analysisResult ? "\n已有拆解：" : null,
          formatAnalysisResultForPrompt(record.analysisResult),
        ].filter(Boolean).join("\n")

        startTransition(() => {
          setSelectedAgentId("content_producer")
          setMessages([])
          setInput(prefill)
          setSourceVideoCopyExtractionId(record.id)
          setSourceTopicTitle(record.videoTitle || "")
          setSourceTopicRationale("")
          setSourceOriginalText(record.transcript || "")
          setSourceAnalysisText(formatAnalysisResultForPrompt(record.analysisResult) || "")
          setEditorText("")
          setEditorFormat(undefined)
          setEditorSourceMessageId(undefined)
          setEditorPanelOpen(true)
        })
        toast.success("已带入对标文案")
      })
      .catch(() => toast.error("对标文案加载失败"))
      .finally(() => {
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete("videoCopyExtractionId")
        replaceAimUrl(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim")
      })
  }, [
    replaceAimUrl,
    searchParams,
    setEditorFormat,
    setEditorPanelOpen,
    setEditorSourceMessageId,
    setEditorText,
    setInput,
    setMessages,
    setSelectedAgentId,
    setSourceAnalysisText,
    setSourceOriginalText,
    setSourceTopicRationale,
    setSourceTopicTitle,
    setSourceVideoCopyExtractionId,
    videoCopyExtractionIdParam,
  ])

  useEffect(() => {
    if (!loadTargetId) return
    const item = storeHistory.find((historyItem) => historyItem.id === loadTargetId)
    if (!item) return
    const contents = getHistoryContents(item)
    const assistantId = nextAimMessageId()
    const itemAgentId = isValidAimAgent(item.agentId) ? item.agentId : DEFAULT_AIM_AGENT
    const historyOriginalText = extractBenchmarkOriginalText(item.rawInput)
    const historyAnalysisText = extractBenchmarkAnalysisText(item.rawInput)
    startTransition(() => {
      setSelectedAgentId(itemAgentId)
      setSelectedProjectId(item.projectId || "")
      setSourceTopicTitle(item.topicTitle || "")
      setSourceTopicRationale("")
      setSourceOriginalText(historyOriginalText)
      setSourceAnalysisText(historyAnalysisText)
      setMessages([
        { id: nextAimMessageId(), role: "user", content: item.rawInput || "（历史素材）" },
        ...(contents.length
          ? [{
              id: assistantId,
              role: "assistant" as const,
              content: `已加载历史记录${item.topicTitle ? `「${item.topicTitle}」` : ""}，可继续改写或追问。`,
              agentId: item.agentId ?? undefined,
              deliverables: {
                id: item.id,
                results: contents.map((content) => ({
                  format: content.format,
                  content: content.content,
                  wordCount: content.content.length,
                })),
                knowledgeUsed: [],
              } as AimGenerateResponse,
            }]
          : [{ id: nextAimMessageId(), role: "assistant" as const, content: "已加载历史素材，可直接让我改写。" }]),
      ])
      if (contents[0]) openEditorFromResult(assistantId, contents[0].format, contents[0].content)
    })
    if (itemAgentId !== selectedAgentId) {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.set("agent", itemAgentId)
      lastAgentParamRef.current = itemAgentId
      replaceAimUrl(`/aim?${nextParams.toString()}`)
    }
    toast.success("已加载历史记录")
    clearLoadTarget()
  }, [
    clearLoadTarget,
    lastAgentParamRef,
    loadTargetId,
    openEditorFromResult,
    replaceAimUrl,
    searchParams,
    selectedAgentId,
    setMessages,
    setSelectedAgentId,
    setSelectedProjectId,
    setSourceAnalysisText,
    setSourceOriginalText,
    setSourceTopicRationale,
    setSourceTopicTitle,
    storeHistory,
  ])
}
