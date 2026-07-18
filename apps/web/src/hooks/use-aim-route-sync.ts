"use client"

import { startTransition, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import { getAimHistory, getVideoCopyExtraction, type AimGenerateResponse, type AimGeneration, type ContentFormat } from "@/lib/api/client"
import { BENCHMARK_RECREATION_PREFILL, buildBenchmarkLengthRule, buildBenchmarkRecreationSopBlock } from "@/lib/aim-benchmark-length"
import { loadAimDraft } from "@/lib/aim/draft-storage"
import { EDITOR_PANEL_DEFAULT_WIDTH } from "@/lib/aim-editor"
import { DEFAULT_AIM_AGENT, isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import {
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  formatAnalysisResultForPrompt,
  getAimHistoryContents,
  nextAimWorkbenchId,
} from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

type Setter<T> = Dispatch<SetStateAction<T>>
type Router = { replace: (href: string) => void }
type SearchParams = { toString: () => string }

export interface AimRouteStateSetters {
  setSelectedAgentId: Setter<AimAgentId>
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
}

export function useAimAgentDraftSwitch(input: {
  agentParam: string | null
  activeAgentId: AimAgentId
  selectedProjectId: string
  projectScope: string
  lastAgentParamRef: MutableRefObject<string | null>
  setters: AimRouteStateSetters
}) {
  const { agentParam, activeAgentId, selectedProjectId, projectScope, lastAgentParamRef, setters } = input
  useEffect(() => {
    if (lastAgentParamRef.current === agentParam) return
    lastAgentParamRef.current = agentParam
    const draft = loadAimDraft(activeAgentId, projectScope)
    startTransition(() => {
      setters.setSelectedAgentId(activeAgentId)
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
    })
  }, [activeAgentId, agentParam, lastAgentParamRef, projectScope, selectedProjectId, setters])
}

export function useAimTopicPrefill(input: {
  topicTitle: string | null
  topicRationale: string | null
  projectId: string | null
  idea: string | null
  router: Router
  searchParams: SearchParams
  setters: AimRouteStateSetters
}) {
  const { topicTitle, topicRationale, projectId, idea, router, searchParams, setters } = input
  useEffect(() => {
    if (!topicTitle && !topicRationale && !projectId && !idea) return
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
    })
    const params = new URLSearchParams(searchParams.toString())
    for (const key of ["topicTitle", "topicRationale", "idea"]) params.delete(key)
    router.replace(params.toString() ? `/aim?${params.toString()}` : "/aim")
  }, [idea, projectId, router, searchParams, setters, topicRationale, topicTitle])
}

export function useAimVideoCopyPrefill(input: {
  extractionId: string | null
  router: Router
  searchParams: SearchParams
  setters: AimRouteStateSetters
}) {
  const { extractionId, router, searchParams, setters } = input
  useEffect(() => {
    if (!extractionId) return
    let active = true
    getVideoCopyExtraction(extractionId)
      .then((record) => {
        if (!active) return
        const analysis = formatAnalysisResultForPrompt(record.analysisResult) || ""
        const lengthRule = buildBenchmarkLengthRule(record.transcript)
        const prefill = [
          BENCHMARK_RECREATION_PREFILL.short, "", "创作原则：", buildBenchmarkRecreationSopBlock(),
          "1. 开头机制可以借，但第一句话必须重写成我的身份和业务场景里的话。",
          "2. 结构节奏可以保留，但表达至少 30% 可感知重写：案例、转折、句式和行动引导不能贴原文。",
          "3. 除专有名词外，不要连续沿用原文 12 个字以上，最终稿要像我的内容，不像原文换皮。",
          lengthRule ? `4. ${lengthRule}` : null, "", record.videoTitle ? `对标标题：${record.videoTitle}` : null,
          "对标原文：", record.transcript || "", record.analysisResult ? "\n已有拆解：" : null, analysis,
        ].filter(Boolean).join("\n")
        startTransition(() => {
          setters.setSelectedAgentId("content_producer")
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
        })
        toast.success("已带入对标文案")
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
  }, [extractionId, router, searchParams, setters])
}

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
  const { loadTargetId, generationIdParam, history, selectedAgentId, router, searchParams, lastAgentParamRef, clearLoadTarget, openEditorFromResult, setters } = input
  const loadedDeepLinkRef = useRef<string | null>(null)
  useEffect(() => {
    const isDeepLink = !loadTargetId && !!generationIdParam
    if (!loadTargetId && !generationIdParam) return
    if (isDeepLink && loadedDeepLinkRef.current === generationIdParam) return
    let active = true
    const load = async () => {
      const item = loadTargetId
        ? history.find((record) => record.id === loadTargetId)
        : generationIdParam ? await getAimHistory(generationIdParam) : undefined
      if (!active || !item) return
      const contents = getAimHistoryContents(item)
      const assistantId = nextAimWorkbenchId()
      const itemAgentId = isValidAimAgent(item.agentId) ? item.agentId : DEFAULT_AIM_AGENT
      startTransition(() => {
        setters.setSelectedAgentId(itemAgentId)
        setters.setSelectedProjectId(item.projectId || "")
        setters.setProjectEnabled(Boolean(item.projectId))
        setters.setSourceTopicTitle(item.topicTitle || "")
        setters.setSourceTopicRationale("")
        setters.setSourceOriginalText(extractBenchmarkOriginalText(item.rawInput))
        setters.setSourceAnalysisText(extractBenchmarkAnalysisText(item.rawInput))
        setters.setMessages([
          { id: nextAimWorkbenchId(), role: "user", content: item.rawInput || "（历史素材）" },
          ...(contents.length ? [{ id: assistantId, role: "assistant" as const, content: `已加载历史记录${item.topicTitle ? `「${item.topicTitle}」` : ""}，可继续改写或追问。`, agentId: item.agentId ?? undefined, deliverables: { id: item.id, results: contents.map((content) => ({ ...content, wordCount: content.content.length })), knowledgeUsed: [], taskSpec: item.taskSpec ?? null } as AimGenerateResponse }]
            : [{ id: nextAimWorkbenchId(), role: "assistant" as const, content: "已加载历史素材，可直接让我改写。" }]),
        ])
        if (contents[0]) openEditorFromResult(assistantId, contents[0].format, contents[0].content)
      })
      if (itemAgentId !== selectedAgentId) {
        const params = new URLSearchParams(searchParams.toString())
        params.set("agent", itemAgentId)
        lastAgentParamRef.current = itemAgentId
        router.replace(`/aim?${params.toString()}`)
      }
      if (isDeepLink) loadedDeepLinkRef.current = item.id
      toast.success("已加载历史记录")
      clearLoadTarget()
    }
    void load().catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : "历史记录加载失败")
    })
    return () => { active = false }
  }, [clearLoadTarget, generationIdParam, history, lastAgentParamRef, loadTargetId, openEditorFromResult, router, searchParams, selectedAgentId, setters])
}
