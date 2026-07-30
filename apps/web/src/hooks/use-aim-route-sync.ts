"use client"

import { startTransition, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import { getAimHistory, getVideoCopyExtraction, type AimGeneration, type ContentFormat } from "@/lib/api/client"
import { buildBenchmarkMaterialPrefill } from "@/lib/aim-benchmark-length"
import { loadAimDraft } from "@/lib/aim/draft-storage"
import { normalizeWorkbenchCopyStudioModule, type CopyStudioModule } from "@/lib/copy-studio"
import { getTaskSpecCopyStudioModule } from "@/lib/task-spec"
import { EDITOR_PANEL_DEFAULT_WIDTH } from "@/lib/aim-editor"
import { isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import {
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  formatAnalysisResultForPrompt,
  mapAimGenerationToDeliverables,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

type Setter<T> = Dispatch<SetStateAction<T>>
type Router = { replace: (href: string) => void }
type SearchParams = { toString: () => string }

/**
 * @description 解析aimhistoryagentmodule
 * @param agentId - 智能体 ID
 * @param taskSpec - task规格
 * @returns 无返回值
 */
export function resolveAimHistoryAgentModule(agentId: AimAgentId, taskSpec: AimGeneration["taskSpec"]) {
  return normalizeWorkbenchCopyStudioModule(agentId, getTaskSpecCopyStudioModule(taskSpec))
}

export interface AimRouteStateSetters {
  setSelectedAgentId: Setter<AimAgentId>
  setAgentModule: (module: CopyStudioModule | undefined) => void
  setSelectedProjectId: Setter<string>
  setProjectEnabled: Setter<boolean>
  setMessages: Setter<AimWorkbenchMessage[]>
  setInput: Setter<string>
  setSourceVideoCopyExtractionId: Setter<string | undefined>
  setSourceOriginalText: Setter<string>
  setSourceAnalysisText: Setter<string>
  setSourceTopicTitle: Setter<string>
  setSourceTopicRationale: Setter<string>
  setEditorText: Setter<string>
  setEditorFormat: Setter<ContentFormat | undefined>
  setEditorSourceMessageId: Setter<string | undefined>
  setEditorPanelWidth: Setter<number>
  setEditorPanelOpen: Setter<boolean>
  setSelectedMethodologyProfileIds?: Setter<string[]>
}

/**
 * @description React Hook：aimagentdraftswitch
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimAgentDraftSwitch(input: {
  agentParam: string | null
  activeAgentId: AimAgentId
  selectedProjectId: string
  projectScope: string
  lastAgentParamRef: MutableRefObject<string | null>
  setters: AimRouteStateSetters
  /** 切智能体时清流程 brief / 图片等非草稿字段，避免跨 agent 串台。 */
  clearEphemeral?: () => void
}) {
  const { agentParam, activeAgentId, selectedProjectId, projectScope, lastAgentParamRef, setters, clearEphemeral } = input
  useEffect(() => {
    if (lastAgentParamRef.current === agentParam) return
    lastAgentParamRef.current = agentParam
    const draft = loadAimDraft(activeAgentId, projectScope)
    startTransition(() => {
      setters.setSelectedAgentId(activeAgentId)
      setters.setAgentModule(normalizeWorkbenchCopyStudioModule(activeAgentId, draft?.agentModule))
      setters.setSelectedProjectId(draft?.selectedProjectId || selectedProjectId)
      setters.setMessages(draft?.messages || [])
      setters.setInput(draft?.input || "")
      setters.setSourceVideoCopyExtractionId(draft?.videoCopyExtractionId)
      setters.setSourceOriginalText(draft?.sourceOriginalText || "")
      setters.setSourceAnalysisText(draft?.sourceAnalysisText || "")
      setters.setSourceTopicTitle(draft?.sourceTopicTitle || "")
      setters.setSourceTopicRationale(draft?.sourceTopicRationale || "")
      setters.setEditorText(draft?.editorText || "")
      setters.setEditorFormat(draft?.editorFormat)
      setters.setEditorSourceMessageId(draft?.editorSourceMessageId)
      setters.setEditorPanelWidth(draft?.editorPanelWidth ?? EDITOR_PANEL_DEFAULT_WIDTH)
      setters.setEditorPanelOpen(draft?.editorPanelOpen ?? true)
      setters.setSelectedMethodologyProfileIds?.(draft?.selectedMethodologyProfileIds ?? [])
      clearEphemeral?.()
    })
  }, [activeAgentId, agentParam, clearEphemeral, lastAgentParamRef, projectScope, selectedProjectId, setters])
}

/**
 * 选题/灵感预填才清会话。仅带 projectId 的工作台 URL 不得清空消息，
 * 否则「新写一篇」剥 stage 等参数、或 searchParams 引用变化时会把进行中的对话抹掉，
 * 页面中间变空白，而生成中的转圈还在。
 */
export function shouldApplyAimTopicPrefill(input: {
  topicTitle: string | null
  topicRationale: string | null
  idea: string | null
}): boolean {
  return Boolean(input.topicTitle?.trim() || input.topicRationale?.trim() || input.idea?.trim())
}

/**
 * @description React Hook：aimtopicprefill
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimTopicPrefill(input: {
  topicTitle: string | null
  topicRationale: string | null
  projectId: string | null
  idea: string | null
  router: Router
  searchParams: SearchParams
  setters: AimRouteStateSetters
  clearEphemeral?: () => void
}) {
  const { topicTitle, topicRationale, projectId, idea, router, searchParams, setters, clearEphemeral } = input
  const consumedPrefillKeyRef = useRef<string | null>(null)
  const search = searchParams.toString()
  useEffect(() => {
    if (!shouldApplyAimTopicPrefill({ topicTitle, topicRationale, idea })) return
    const consumeKey = [topicTitle ?? "", topicRationale ?? "", idea ?? "", projectId ?? ""].join("\0")
    if (consumedPrefillKeyRef.current === consumeKey) return
    consumedPrefillKeyRef.current = consumeKey
    const prefill = [topicTitle ? `选题：${topicTitle}` : null, topicRationale ? `选题依据：${topicRationale}` : null, idea ? `创作灵感：${idea}` : null]
      .filter(Boolean).join("\n")
    startTransition(() => {
      if (projectId) {
        setters.setSelectedProjectId(projectId)
        setters.setProjectEnabled(true)
      }
      setters.setMessages([])
      setters.setInput(prefill)
      setters.setSourceTopicTitle(topicTitle || idea || "")
      setters.setSourceTopicRationale(topicRationale || "")
      setters.setSourceVideoCopyExtractionId(undefined)
      setters.setSourceOriginalText("")
      setters.setSourceAnalysisText("")
      setters.setEditorText("")
      setters.setEditorFormat(undefined)
      setters.setEditorSourceMessageId(undefined)
      setters.setSelectedMethodologyProfileIds?.([])
      clearEphemeral?.()
    })
    const params = new URLSearchParams(search)
    let stripped = false
    for (const key of ["topicTitle", "topicRationale", "idea"]) {
      if (!params.has(key)) continue
      params.delete(key)
      stripped = true
    }
    if (stripped) {
      router.replace(params.toString() ? `/aim?${params.toString()}` : "/aim")
    }
  }, [clearEphemeral, idea, projectId, router, search, setters, topicRationale, topicTitle])
}

/**
 * @description React Hook：aimvideocopyprefill
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimVideoCopyPrefill(input: {
  extractionId: string | null
  router: Router
  searchParams: SearchParams
  setters: AimRouteStateSetters
  clearEphemeral?: () => void
}) {
  const { extractionId, router, searchParams, setters, clearEphemeral } = input
  useEffect(() => {
    if (!extractionId) return
    let active = true
    getVideoCopyExtraction(extractionId)
      .then((record) => {
        if (!active) return
        const analysis = formatAnalysisResultForPrompt(record.analysisResult) || ""
        // 只带材料进入文案创作；创作原则/SOP 由服务端内置
        const prefill = buildBenchmarkMaterialPrefill({
          intent: "handoff",
          videoTitle: record.videoTitle,
          transcript: record.transcript,
          analysis: record.analysisResult ? analysis : null,
        })
        startTransition(() => {
          setters.setSelectedAgentId("content_producer")
          setters.setAgentModule(undefined)
          setters.setMessages([])
          setters.setInput(prefill)
          setters.setSourceVideoCopyExtractionId(record.id)
          setters.setSourceTopicTitle(record.videoTitle || "")
          setters.setSourceTopicRationale("")
          setters.setSourceOriginalText(record.transcript || "")
          setters.setSourceAnalysisText(analysis)
          setters.setEditorText("")
          setters.setEditorFormat(undefined)
          setters.setEditorSourceMessageId(undefined)
          setters.setEditorPanelOpen(true)
          setters.setSelectedMethodologyProfileIds?.([])
          clearEphemeral?.()
        })
        toast.success("已带入对标文案，进入文案创作")
      })
      .catch(() => toast.error("对标文案加载失败"))
      .finally(() => {
        if (!active) return
        const params = new URLSearchParams(searchParams.toString())
        params.delete("videoCopyExtractionId")
        router.replace(params.toString() ? `/aim?${params.toString()}` : "/aim")
      })
    return () => {
      active = false
    }
  }, [clearEphemeral, extractionId, router, searchParams, setters])
}

async function resolveHistoryLoadItem(input: {
  loadTargetId: string | null
  generationIdParam: string | null
  history: AimGeneration[]
}): Promise<AimGeneration | undefined> {
  const { loadTargetId, generationIdParam, history } = input
  if (loadTargetId) {
    const local = history.find((record) => record.id === loadTargetId)
    if (local) return local
  }
  const targetId = loadTargetId || generationIdParam
  if (!targetId) return undefined
  try {
    return await getAimHistory(targetId)
  } catch {
    return undefined
  }
}

function buildHistoryLoadMessages(item: AimGeneration, assistantId: string) {
  const deliverables = mapAimGenerationToDeliverables(item)
  const contents = deliverables.results
  const newsroom = item.taskSpec && typeof item.taskSpec === "object" && !Array.isArray(item.taskSpec)
    ? (item.taskSpec as { newsroom?: { stage?: string; sourceCount?: number; editorDiffSummary?: string } }).newsroom
    : undefined
  const stageHint = newsroom?.stage
    ? `编辑室阶段：${newsroom.stage}${newsroom.sourceCount != null ? ` · 样本 ${newsroom.sourceCount}` : ""}`
    : ""
  const messages: AimWorkbenchMessage[] = [
    { id: nextAimWorkbenchId(), role: "user", content: item.rawInput || "（历史素材）" },
  ]
  if (contents.length) {
    messages.push({
      id: assistantId,
      role: "assistant",
      content: [
        `已加载历史记录${item.topicTitle ? `「${item.topicTitle}」` : ""}，可继续改写或追问。`,
        stageHint,
      ].filter(Boolean).join("\n"),
      agentId: item.agentId ?? undefined,
      deliverables,
      editorDiffSummary: newsroom?.editorDiffSummary || null,
    })
  } else {
    messages.push({
      id: nextAimWorkbenchId(),
      role: "assistant",
      content: ["已加载历史素材，可直接让我改写。", stageHint].filter(Boolean).join("\n"),
    })
  }
  return { messages, contents, deliverables }
}

/**
 * @description React Hook：aimhistoryload
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimHistoryLoad(input: {
  loadTargetId: string | null
  generationIdParam: string | null
  history: AimGeneration[]
  selectedAgentId: AimAgentId
  router: Router
  searchParams: SearchParams
  lastAgentParamRef: MutableRefObject<string | null>
  clearLoadTarget: () => void
  openEditorFromResult: (messageId: string, format: ContentFormat, content: string) => void
  setters: AimRouteStateSetters
}) {
  const {
    loadTargetId, generationIdParam, history, selectedAgentId, router, searchParams,
    lastAgentParamRef, clearLoadTarget, openEditorFromResult, setters,
  } = input
  const loadedDeepLinkRef = useRef<string | null>(null)
  useEffect(() => {
    const isDeepLink = !loadTargetId && !!generationIdParam
    if (!loadTargetId && !generationIdParam) return
    if (isDeepLink && loadedDeepLinkRef.current === generationIdParam) return
    let active = true
    const load = async () => {
      const item = await resolveHistoryLoadItem({ loadTargetId, generationIdParam, history })
      if (!active) return
      if (!item) {
        toast.error("历史记录加载失败，请稍后重试")
        clearLoadTarget()
        return
      }
      const assistantId = nextAimWorkbenchId()
      const itemAgentId = isValidAimAgent(item.agentId) ? item.agentId : selectedAgentId
      const { messages, contents } = buildHistoryLoadMessages(item, assistantId)
      startTransition(() => {
        setters.setSelectedAgentId(itemAgentId)
        setters.setAgentModule(resolveAimHistoryAgentModule(itemAgentId, item.taskSpec))
        setters.setSelectedProjectId(item.projectId || "")
        setters.setProjectEnabled(Boolean(item.projectId))
        setters.setSourceTopicTitle(item.topicTitle || "")
        setters.setSourceTopicRationale("")
        setters.setSourceOriginalText(extractBenchmarkOriginalText(item.rawInput))
        setters.setSourceAnalysisText(extractBenchmarkAnalysisText(item.rawInput))
        setters.setMessages(messages)
        if (contents[0]) openEditorFromResult(assistantId, contents[0].format, contents[0].content)
      })
      if (itemAgentId !== selectedAgentId) {
        const params = new URLSearchParams(searchParams.toString())
        params.set("agent", itemAgentId)
        params.delete("generationId")
        lastAgentParamRef.current = itemAgentId
        router.replace(`/aim?${params.toString()}`)
      }
      if (isDeepLink) loadedDeepLinkRef.current = item.id
      toast.success("已加载历史记录")
      clearLoadTarget()
    }
    void load().catch((error) => {
      if (!active) return
      toast.error(error instanceof Error ? error.message : "历史记录加载失败")
      clearLoadTarget()
    })
    return () => { active = false }
  }, [clearLoadTarget, generationIdParam, history, lastAgentParamRef, loadTargetId, openEditorFromResult, router, searchParams, selectedAgentId, setters])
}
