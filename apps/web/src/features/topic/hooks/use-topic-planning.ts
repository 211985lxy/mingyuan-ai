"use client"

import { useEffect, useMemo, useRef, useState, startTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import {
  createKnowledge,
  deleteKnowledge,
  generateTopics,
  getTodayAiHotBriefing,
  getTodayTopics,
  listClientProjects,
  listKnowledge,
  selectTopic,
  sendTopicChatMessage,
  updateKnowledge,
  type ClientProject,
  type KnowledgeEntry,
  type TopicChatResponse,
} from "@/lib/api/client"
import { buildDefaultKnowledgeTags, mergeKnowledgeTags } from "@/lib/knowledge-tags"
import { buildTopicDailyReport, type TopicDailyReportSource } from "@/lib/topic-daily-report"
import { buildTopicPoolDraftFromSearchParams } from "@/lib/topic-pool-draft"
import type { ApiAiHotBriefingItem, ApiTopicCard, ApiTopicRecommendationMode } from "@/types/api"
import {
  TOPIC_CATEGORY_META,
  type TopicCategory,
} from "@/components/topic-planning/topic-knowledge-pool"

// ---------------------------------------------------------------------------
// Master hook — consolidates all topic-planning state, effects, handlers,
// and derived data so the page is a thin assembly layer.
// ---------------------------------------------------------------------------

export function useTopicPlanning() {
  const router = useRouter()
  const routeSearchParams = useSearchParams()
  const searchParams = useMemo(() => routeSearchParams ?? new URLSearchParams(), [routeSearchParams])
  const importedDraftKey = useRef("")
  const topicGenerationInFlightRef = useRef(false)

  // ---- State ----
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingKnowledge, setLoadingKnowledge] = useState(false)
  const [knowledgeLoadedProjectId, setKnowledgeLoadedProjectId] = useState<string | null>(null)
  const [savingCategory, setSavingCategory] = useState<TopicCategory | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [recommendationMode, setRecommendationMode] = useState<ApiTopicRecommendationMode>("daily")
  const [topicCards, setTopicCards] = useState<ApiTopicCard[]>([])
  const [dailyBriefingItems, setDailyBriefingItems] = useState<ApiAiHotBriefingItem[]>([])
  const [dailyReportSources, setDailyReportSources] = useState<TopicDailyReportSource[]>([])
  const [topicSelectionId, setTopicSelectionId] = useState<string | null>(null)
  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number | null>(null)
  const [topicRefreshCount, setTopicRefreshCount] = useState(0)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [autoGenerateError, setAutoGenerateError] = useState("")
  const [topicChatInput, setTopicChatInput] = useState("")
  const [topicChatLoading, setTopicChatLoading] = useState(false)
  const [topicChatReply, setTopicChatReply] = useState<TopicChatResponse | null>(null)
  const [forms, setForms] = useState<Record<TopicCategory, { title: string; content: string }>>({
    daily_inspiration: { title: "", content: "" },
    meeting_minutes: { title: "", content: "" },
    benchmark_reference: { title: "", content: "" },
    user_insight: { title: "", content: "" },
  })

  // ---- Derived ----
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const generationKnowledgeIds = selectedKnowledgeIds.length > 0
    ? selectedKnowledgeIds
    : knowledgeEntries.map((e) => e.id)

  // ---- Effect: draft import from URL params ----
  useEffect(() => {
    const draft = buildTopicPoolDraftFromSearchParams(searchParams)
    if (!draft) return

    const draftKey = `${draft.title}\n${draft.content}`
    startTransition(() => {
      setForms((current) => ({ ...current, daily_inspiration: draft }))
    })

    if (!selectedProjectId || knowledgeLoadedProjectId !== selectedProjectId) return

    const importKey = `${selectedProjectId}\n${draftKey}`
    if (importedDraftKey.current === importKey) return
    importedDraftKey.current = importKey

    const existing = knowledgeEntries.find(
      (entry) => entry.category === "daily_inspiration" && entry.title === draft.title && entry.content === draft.content,
    )
    if (existing) {
      startTransition(() => { setSelectedKnowledgeIds((c) => [...new Set([existing.id, ...c])]) })
      toast.success("热点已在选题池中，并已选中")
      return
    }

    let cancelled = false
    startTransition(() => setSavingCategory("daily_inspiration"))
    createKnowledge({
      projectId: selectedProjectId, category: "daily_inspiration",
      title: draft.title, content: draft.content,
      tags: mergeKnowledgeTags(["AI HOT"], buildDefaultKnowledgeTags("daily_inspiration")),
      sourceType: "import",
    })
      .then((entry) => {
        if (cancelled) return
        setKnowledgeEntries((c) => [entry, ...c])
        setSelectedKnowledgeIds((c) => [...new Set([entry.id, ...c])])
        toast.success("热点已加入选题池，并已选中")
      })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "热点加入选题池失败") })
      .finally(() => { if (!cancelled) setSavingCategory(null) })

    return () => { cancelled = true }
  }, [knowledgeEntries, knowledgeLoadedProjectId, searchParams, selectedProjectId])

  // ---- Effect: load projects ----
  useEffect(() => {
    listClientProjects()
      .then((data) => { setProjects(data); setSelectedProjectId(data[0]?.id || "") })
      .catch(() => toast.error("选题工作台初始化失败，请刷新后重试"))
      .finally(() => setLoadingProjects(false))
  }, [])

  // ---- Effect: load knowledge on project change ----
  useEffect(() => {
    if (!selectedProjectId) {
      startTransition(() => {
        setKnowledgeEntries([]); setSelectedKnowledgeIds([]); setKnowledgeLoadedProjectId(null)
        setTopicCards([]); setDailyBriefingItems([]); setDailyReportSources([])
        setTopicSelectionId(null); setSelectedTopicIndex(null); setTopicRefreshCount(0)
      })
      return
    }
    startTransition(() => { setLoadingKnowledge(true); setKnowledgeLoadedProjectId(null) })
    listKnowledge({ projectId: selectedProjectId, status: "active" })
      .then((entries) => {
        setKnowledgeEntries(entries); setSelectedKnowledgeIds([])
        setKnowledgeLoadedProjectId(selectedProjectId)
        setTopicCards([]); setDailyBriefingItems([]); setDailyReportSources([])
        setTopicSelectionId(null); setSelectedTopicIndex(null); setTopicRefreshCount(0)
      })
      .catch(() => toast.error("项目素材读取失败，请稍后重试"))
      .finally(() => setLoadingKnowledge(false))
  }, [selectedProjectId])

  // ---- Effect: auto-generate daily topics ----
  useEffect(() => {
    if (!selectedProjectId || knowledgeLoadedProjectId !== selectedProjectId || loadingKnowledge) return
    if (topicCards.length > 0 || topicGenerationInFlightRef.current) return

    let cancelled = false
    topicGenerationInFlightRef.current = true
    startTransition(() => setAutoGenerating(true))

    getTodayTopics("daily")
      .then((result) => {
        if (cancelled) return
        if (result.mode === "cached" && result.cards && result.cards.length > 0 && result.topicSelectionId) {
          setTopicCards(result.cards); setDailyReportSources(result.sourceHighlights ?? [])
          setTopicSelectionId(result.topicSelectionId); setSelectedTopicIndex(null)
          setTopicRefreshCount((c) => c + 1)
          getTodayAiHotBriefing().then((b) => { if (!cancelled) setDailyBriefingItems(b.items) }).catch(() => {})
          toast.success("已加载今日备选选题")
          return
        }
        return generateTopics({ projectId: selectedProjectId, knowledgeEntryIds: knowledgeEntries.map((e) => e.id), refreshCount: 0, recommendationMode: "daily" })
      })
      .then((genResult) => {
        if (cancelled || !genResult) return
        setAutoGenerateError(""); setTopicCards(genResult.cards)
        setDailyReportSources(genResult.sourceHighlights ?? [])
        setTopicSelectionId(genResult.topicSelectionId); setSelectedTopicIndex(null)
        setTopicRefreshCount((c) => c + 1)
        toast.success("已自动生成今日备选选题")
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[topic-auto] Auto-generation failed:", err)
        setAutoGenerateError(err instanceof Error ? err.message : "每日选题日报自动生成失败")
      })
      .finally(() => { topicGenerationInFlightRef.current = false; if (!cancelled) setAutoGenerating(false) })

    return () => { cancelled = true }
  }, [selectedProjectId, knowledgeLoadedProjectId, loadingKnowledge, knowledgeEntries, topicCards.length])

  // ---- Handlers ----
  function updateForm(category: TopicCategory, field: "title" | "content", value: string) {
    setForms((c) => ({ ...c, [category]: { ...c[category], [field]: value } }))
  }

  function toggleKnowledgeSelection(entryId: string) {
    setSelectedKnowledgeIds((c) => c.includes(entryId) ? c.filter((id) => id !== entryId) : [...c, entryId])
  }

  async function handleCreateKnowledge(category: TopicCategory) {
    if (!selectedProjectId) { toast.error("先选择一个 IP 营销全案"); return }
    const title = forms[category].title.trim()
    const content = forms[category].content.trim()
    if (!title || !content) { toast.error("标题和内容都要填写"); return }
    setSavingCategory(category)
    try {
      const entry = await createKnowledge({ projectId: selectedProjectId, category, title, content, tags: buildDefaultKnowledgeTags(category) })
      setKnowledgeEntries((c) => [entry, ...c])
      setSelectedKnowledgeIds((c) => [...new Set([entry.id, ...c])])
      setForms((c) => ({ ...c, [category]: { title: "", content: "" } }))
      toast.success("素材已加入选题池")
    } catch (error) { toast.error(error instanceof Error ? error.message : "素材保存失败") }
    finally { setSavingCategory(null) }
  }

  async function handleUpdateKnowledge(entryId: string, data: { title: string; content: string }) {
    const nextTitle = data.title.trim()
    const nextContent = data.content.trim()
    if (!nextTitle || !nextContent) { toast.error("标题和内容都不能为空"); return }
    try {
      const updated = await updateKnowledge(entryId, { title: nextTitle, content: nextContent })
      setKnowledgeEntries((c) => c.map((e) => (e.id === entryId ? updated : e)))
      toast.success("素材已更新")
    } catch (error) { toast.error(error instanceof Error ? error.message : "素材更新失败") }
  }

  async function handleArchiveKnowledge(entryId: string) {
    try {
      await deleteKnowledge(entryId)
      setKnowledgeEntries((c) => c.filter((e) => e.id !== entryId))
      setSelectedKnowledgeIds((c) => c.filter((id) => id !== entryId))
      toast.success("素材已归档")
    } catch (error) { toast.error(error instanceof Error ? error.message : "素材归档失败") }
  }

  async function handleGenerateTopics() {
    if (!selectedProjectId) { toast.error("先选择一个 IP 营销全案"); return }
    if (topicGenerationInFlightRef.current) { toast.info("今日选题正在生成，请等待当前结果"); return }
    topicGenerationInFlightRef.current = true
    setIsGenerating(true)
    try {
      const result = await generateTopics({ projectId: selectedProjectId, knowledgeEntryIds: generationKnowledgeIds, refreshCount: topicRefreshCount, recommendationMode })
      setTopicCards(result.cards); setAutoGenerateError("")
      setDailyReportSources(result.sourceHighlights ?? [])
      if (recommendationMode === "daily") {
        const briefing = await getTodayAiHotBriefing().catch(() => null)
        setDailyBriefingItems(briefing?.items ?? [])
      } else {
        setDailyBriefingItems([]); setDailyReportSources([])
      }
      setTopicSelectionId(result.topicSelectionId); setSelectedTopicIndex(null)
      setTopicRefreshCount((c) => c + 1)
      toast.success(`已生成 4 个${MODE_META[recommendationMode].label}`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "选题生成失败") }
    finally { topicGenerationInFlightRef.current = false; setIsGenerating(false) }
  }

  async function handleTopicChatSubmit() {
    const content = topicChatInput.trim()
    if (!selectedProjectId) { toast.error("先选择一个客户项目"); return }
    if (content.length < 2) { toast.error("先说一句具体想法"); return }
    setTopicChatLoading(true)
    try {
      const result = await sendTopicChatMessage({ projectId: selectedProjectId, content })
      setTopicChatReply(result); setTopicCards(result.cards)
      setTopicSelectionId(result.topicSelectionId); setSelectedTopicIndex(null)
      setSelectedKnowledgeIds((c) => [...new Set([result.knowledgeEntry.id, ...c])])
      setKnowledgeEntries((c) => [{ ...result.knowledgeEntry, projectId: selectedProjectId, content, tags: [], sourceType: "manual", sortOrder: 0, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...c] as KnowledgeEntry[])
      setTopicChatInput(""); toast.success("已整理成方向")
    } catch (error) { toast.error(error instanceof Error ? error.message : "生成失败") }
    finally { setTopicChatLoading(false) }
  }

  async function handleSelectTopic(_card: ApiTopicCard, index: number) {
    if (!topicSelectionId) { toast.error("当前没有可采用的选题批次"); return }
    try {
      await selectTopic(topicSelectionId, index)
      setSelectedTopicIndex(index); toast.success("选题已采用，可继续去 AIM 写文案")
    } catch (error) { toast.error(error instanceof Error ? error.message : "选题采用失败") }
  }

  function handleModeChange(mode: ApiTopicRecommendationMode) {
    setRecommendationMode(mode)
    setTopicCards([]); setDailyBriefingItems([]); setDailyReportSources([])
    setTopicSelectionId(null); setSelectedTopicIndex(null)
  }

  function jumpToAim(card: ApiTopicCard, index: number) {
    const params = new URLSearchParams()
    params.set("agent", "content_producer"); params.set("mode", selectedProjectId ? "asset_pack" : "quick")
    params.set("topicTitle", card.title)
    if (card.rationale) params.set("topicRationale", card.rationale)
    if (selectedProjectId) params.set("projectId", selectedProjectId)
    if (topicSelectionId) params.set("topicSelectionId", topicSelectionId)
    if (Number.isInteger(index)) params.set("selectedTopicIndex", String(index))
    router.push(`/aim?${params.toString()}`)
  }

  // ---- Derived data for rendering ----
  const dailyReport = useMemo(
    () => recommendationMode === "daily" && topicCards.length > 0
      ? buildTopicDailyReport(topicCards, dailyBriefingItems, recommendationMode, dailyReportSources)
      : null,
    [dailyBriefingItems, dailyReportSources, recommendationMode, topicCards],
  )

  return {
    // state
    projects, selectedProjectId, setSelectedProjectId, selectedProject,
    knowledgeEntries, selectedKnowledgeIds, setSelectedKnowledgeIds, loadingProjects, loadingKnowledge,
    savingCategory, isGenerating, recommendationMode, setRecommendationMode,
    topicCards, dailyBriefingItems, dailyReportSources,
    topicSelectionId, selectedTopicIndex, topicRefreshCount,
    autoGenerating, autoGenerateError,
    topicChatInput, setTopicChatInput, topicChatLoading, topicChatReply,
    forms,
    // derived
    dailyReport,
    selectedKnowledgeLabels: selectedKnowledgeIds.flatMap((entryId) => {
      const entry = knowledgeEntries.find((item) => item.id === entryId)
      return entry ? [`${TOPIC_CATEGORY_META[entry.category as TopicCategory]?.label ?? "素材"} · ${entry.title}`] : []
    }),
    // handlers
    updateForm, toggleKnowledgeSelection,
    handleCreateKnowledge, handleUpdateKnowledge, handleArchiveKnowledge,
    handleGenerateTopics, handleTopicChatSubmit, handleModeChange,
    handleSelectTopic, jumpToAim,
  }
}

/** Shared across hook and page for mode display. */
export const MODE_META: Record<ApiTopicRecommendationMode, { label: string; description: string }> = {
  normal: { label: "常规选题", description: "基于现有素材，给你一组能直接判断的选题。" },
  daily: { label: "每日选题日报", description: "先告诉你今天主推哪条，再补充原因和备选。" },
  weekly: { label: "本周选题", description: "把本周值得拍的方向先排出来，方便继续筛。" },
}
