"use client"

import { useEffect, useMemo, useRef, useState, startTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Target } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import {
  createKnowledge, deleteKnowledge, generateTopics, getTodayAiHotBriefing, getTodayTopics,
  listClientProjects, listKnowledge, selectTopic, sendTopicChatMessage, updateKnowledge,
  type ClientProject, type KnowledgeEntry, type TopicChatResponse,
} from "@/lib/api/client"
import { buildDefaultKnowledgeTags, mergeKnowledgeTags } from "@/lib/knowledge-tags"
import { buildTopicDailyReport, type TopicDailyReportSource } from "@/lib/topic-daily-report"
import { buildTopicPoolDraftFromSearchParams } from "@/lib/topic-pool-draft"
import { TopicResultsPanel } from "@/features/topics/components/topic-results-panel"
import { TopicPoolPanel, type TopicKnowledgeForms } from "@/features/topics/components/topic-pool-panel"
import { MODE_META, type TopicCategory } from "@/features/topics/topic-planning-config"
import type { ApiAiHotBriefingItem, ApiTopicCard, ApiTopicRecommendationMode } from "@/types/api"
export default function TopicPlanningPage() {
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const importedDraftKey = useRef("")
  const topicGenerationInFlightRef = useRef(false)
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
  const [forms, setForms] = useState<TopicKnowledgeForms>({
    daily_inspiration: { title: "", content: "" },
    meeting_minutes: { title: "", content: "" },
    benchmark_reference: { title: "", content: "" },
    user_insight: { title: "", content: "" },
  })

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const generationKnowledgeIds = selectedKnowledgeIds.length > 0
    ? selectedKnowledgeIds
    : knowledgeEntries.map((entry) => entry.id)

  useEffect(() => {
    const draft = buildTopicPoolDraftFromSearchParams(searchParams)
    if (!draft) return

    const draftKey = `${draft.title}\n${draft.content}`
    startTransition(() => {
      setForms((current) => ({
        ...current,
        daily_inspiration: draft,
      }))
    })

    if (!selectedProjectId || knowledgeLoadedProjectId !== selectedProjectId) return

    const importKey = `${selectedProjectId}\n${draftKey}`
    if (importedDraftKey.current === importKey) return
    importedDraftKey.current = importKey

    const existing = knowledgeEntries.find(
      (entry) =>
        entry.category === "daily_inspiration" &&
        entry.title === draft.title &&
        entry.content === draft.content,
    )
    if (existing) {
      startTransition(() => {
        setSelectedKnowledgeIds((current) => [...new Set([existing.id, ...current])])
      })
      toast.success("热点已在选题池中，并已选中")
      return
    }

    let cancelled = false
    startTransition(() => setSavingCategory("daily_inspiration"))
    createKnowledge({
      projectId: selectedProjectId,
      category: "daily_inspiration",
      title: draft.title,
      content: draft.content,
      tags: mergeKnowledgeTags(["AI HOT"], buildDefaultKnowledgeTags("daily_inspiration")),
      sourceType: "import",
    })
      .then((entry) => {
        if (cancelled) return
        setKnowledgeEntries((current) => [entry, ...current])
        setSelectedKnowledgeIds((current) => [...new Set([entry.id, ...current])])
        toast.success("热点已加入选题池，并已选中")
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : "热点加入选题池失败")
      })
      .finally(() => {
        if (!cancelled) setSavingCategory(null)
      })

    return () => {
      cancelled = true
    }
  }, [knowledgeEntries, knowledgeLoadedProjectId, searchParams, selectedProjectId])

  useEffect(() => {
    listClientProjects()
      .then((projectData) => {
        setProjects(projectData)
        setSelectedProjectId(projectData[0]?.id || "")
      })
      .catch(() => {
        toast.error("选题工作台初始化失败，请刷新后重试")
      })
      .finally(() => setLoadingProjects(false))
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      startTransition(() => {
        setKnowledgeEntries([])
        setSelectedKnowledgeIds([])
        setKnowledgeLoadedProjectId(null)
        setTopicCards([])
        setDailyBriefingItems([])
        setDailyReportSources([])
        setTopicSelectionId(null)
        setSelectedTopicIndex(null)
        setTopicRefreshCount(0)
      })
      return
    }

    startTransition(() => {
      setLoadingKnowledge(true)
      setKnowledgeLoadedProjectId(null)
    })
    listKnowledge({ projectId: selectedProjectId, status: "active" })
      .then((entries) => {
        setKnowledgeEntries(entries)
        setSelectedKnowledgeIds([])
        setKnowledgeLoadedProjectId(selectedProjectId)
        setTopicCards([])
        setDailyBriefingItems([])
        setDailyReportSources([])
        setTopicSelectionId(null)
        setSelectedTopicIndex(null)
        setTopicRefreshCount(0)
      })
      .catch(() => toast.error("项目素材读取失败，请稍后重试"))
      .finally(() => setLoadingKnowledge(false))
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || knowledgeLoadedProjectId !== selectedProjectId || loadingKnowledge) return
    if (topicCards.length > 0) return // 已有卡片不重复触发
    if (topicGenerationInFlightRef.current) return

    let cancelled = false
    topicGenerationInFlightRef.current = true
    startTransition(() => setAutoGenerating(true))

    getTodayTopics("daily")
      .then((result) => {
        if (cancelled) return
        if (result.mode === "cached" && result.cards && result.cards.length > 0 && result.topicSelectionId) {
          setTopicCards(result.cards)
          setDailyReportSources(result.sourceHighlights ?? [])
          setTopicSelectionId(result.topicSelectionId)
          setSelectedTopicIndex(null)
          setTopicRefreshCount((c) => c + 1)
          getTodayAiHotBriefing()
            .then((briefing) => {
              if (!cancelled) setDailyBriefingItems(briefing.items)
            })
            .catch(() => {})
          toast.success("已加载今日备选选题")
          return
        }
        const entryIds = knowledgeEntries.map((e) => e.id)
        return generateTopics({
          projectId: selectedProjectId,
          knowledgeEntryIds: entryIds,
          refreshCount: 0,
          recommendationMode: "daily",
        })
      })
      .then((genResult) => {
        if (cancelled || !genResult) return
        setAutoGenerateError("")
        setTopicCards(genResult.cards)
        setDailyReportSources(genResult.sourceHighlights ?? [])
        setTopicSelectionId(genResult.topicSelectionId)
        setSelectedTopicIndex(null)
        setTopicRefreshCount((c) => c + 1)
        toast.success("已自动生成今日备选选题")
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[topic-auto] Auto-generation failed:", err)
        setAutoGenerateError(err instanceof Error ? err.message : "每日选题日报自动生成失败")
      })
      .finally(() => {
        topicGenerationInFlightRef.current = false
        if (!cancelled) setAutoGenerating(false)
      })

    return () => { cancelled = true }
  }, [selectedProjectId, knowledgeLoadedProjectId, loadingKnowledge, knowledgeEntries, topicCards.length])

  function updateForm(category: TopicCategory, field: "title" | "content", value: string) {
    setForms((current) => ({
      ...current,
      [category]: {
        ...current[category],
        [field]: value,
      },
    }))
  }

  function toggleKnowledgeSelection(entryId: string) {
    setSelectedKnowledgeIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId],
    )
  }

  async function handleCreateKnowledge(category: TopicCategory) {
    if (!selectedProjectId) {
      toast.error("先选择一个 IP 营销全案")
      return
    }

    const title = forms[category].title.trim()
    const content = forms[category].content.trim()

    if (!title || !content) {
      toast.error("标题和内容都要填写")
      return
    }

    setSavingCategory(category)
    try {
      const entry = await createKnowledge({
        projectId: selectedProjectId,
        category,
        title,
        content,
        tags: buildDefaultKnowledgeTags(category),
      })
      setKnowledgeEntries((current) => [entry, ...current])
      setSelectedKnowledgeIds((current) => [...new Set([entry.id, ...current])])
      setForms((current) => ({
        ...current,
        [category]: { title: "", content: "" },
      }))
      toast.success("素材已加入选题池")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "素材保存失败")
    } finally {
      setSavingCategory(null)
    }
  }

  async function handleUpdateKnowledge(
    entryId: string,
    data: { title: string; content: string },
  ) {
    const nextTitle = data.title.trim()
    const nextContent = data.content.trim()
    if (!nextTitle || !nextContent) {
      toast.error("标题和内容都不能为空")
      return
    }

    try {
      const updated = await updateKnowledge(entryId, {
        title: nextTitle,
        content: nextContent,
      })
      setKnowledgeEntries((current) =>
        current.map((entry) => (entry.id === entryId ? updated : entry)),
      )
      toast.success("素材已更新")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "素材更新失败")
    }
  }

  async function handleArchiveKnowledge(entryId: string) {
    try {
      await deleteKnowledge(entryId)
      setKnowledgeEntries((current) => current.filter((entry) => entry.id !== entryId))
      setSelectedKnowledgeIds((current) => current.filter((id) => id !== entryId))
      toast.success("素材已归档")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "素材归档失败")
    }
  }

  async function handleGenerateTopics() {
    if (!selectedProjectId) {
      toast.error("先选择一个 IP 营销全案")
      return
    }
    if (topicGenerationInFlightRef.current) {
      toast.info("今日选题正在生成，请等待当前结果")
      return
    }
    topicGenerationInFlightRef.current = true
    setIsGenerating(true)
    try {
      const result = await generateTopics({
        projectId: selectedProjectId,
        knowledgeEntryIds: generationKnowledgeIds,
        refreshCount: topicRefreshCount,
        recommendationMode,
      })
      setTopicCards(result.cards)
      setAutoGenerateError("")
      setDailyReportSources(result.sourceHighlights ?? [])
      if (recommendationMode === "daily") {
        const briefing = await getTodayAiHotBriefing().catch(() => null)
        setDailyBriefingItems(briefing?.items ?? [])
      } else {
        setDailyBriefingItems([])
        setDailyReportSources([])
      }
      setTopicSelectionId(result.topicSelectionId)
      setSelectedTopicIndex(null)
      setTopicRefreshCount((current) => current + 1)
      toast.success(`已生成 4 个${MODE_META[recommendationMode].label}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "选题生成失败")
    } finally {
      topicGenerationInFlightRef.current = false
      setIsGenerating(false)
    }
  }

  async function handleTopicChatSubmit() {
    const content = topicChatInput.trim()
    if (!selectedProjectId) {
      toast.error("先选择一个客户项目")
      return
    }
    if (content.length < 2) {
      toast.error("先说一句具体想法")
      return
    }

    setTopicChatLoading(true)
    try {
      const result = await sendTopicChatMessage({ projectId: selectedProjectId, content })
      setTopicChatReply(result)
      setTopicCards(result.cards)
      setTopicSelectionId(result.topicSelectionId)
      setSelectedTopicIndex(null)
      setSelectedKnowledgeIds((current) => [...new Set([result.knowledgeEntry.id, ...current])])
      setKnowledgeEntries((current) => [
        {
          ...result.knowledgeEntry,
          projectId: selectedProjectId,
          content,
          tags: [],
          sourceType: "manual",
          sortOrder: 0,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...current,
      ] as KnowledgeEntry[])
      setTopicChatInput("")
      toast.success("已整理成方向")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败")
    } finally {
      setTopicChatLoading(false)
    }
  }

  async function handleSelectTopic(_card: ApiTopicCard, index: number) {
    if (!topicSelectionId) {
      toast.error("当前没有可采用的选题批次")
      return
    }

    try {
      await selectTopic(topicSelectionId, index)
      setSelectedTopicIndex(index)
      toast.success("选题已采用，可继续去 AIM 写文案")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "选题采用失败")
    }
  }

  function jumpToAim(card: ApiTopicCard, index: number) {
    const params = new URLSearchParams()
    params.set("agent", "content_producer")
    params.set("mode", "asset_pack")
    params.set("topicTitle", card.title)
    if (card.rationale) params.set("topicRationale", card.rationale)
    if (selectedProjectId) params.set("projectId", selectedProjectId)
    if (topicSelectionId) params.set("topicSelectionId", topicSelectionId)
    if (Number.isInteger(index)) params.set("selectedTopicIndex", String(index))
    router.push(`/aim?${params.toString()}`)
  }

  const dailyReport = useMemo(
    () => recommendationMode === "daily" && topicCards.length > 0
      ? buildTopicDailyReport(topicCards, dailyBriefingItems, recommendationMode, dailyReportSources)
      : null,
    [dailyBriefingItems, dailyReportSources, recommendationMode, topicCards],
  )
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <WorkbenchHero
        title="选题工作台"
        subtitle="先看今天该拍什么，再看为什么是它；不满意，再从备选里换。"
        badge={<Badge variant="secondary">{MODE_META[recommendationMode].label}</Badge>}
      />

      {!selectedProjectId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">先选择一个客户项目，再开始沉淀选题素材。</p>
            <p className="mt-1 text-xs text-muted-foreground">
              先把客户分开，后面的主推和备选才不会串味。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            <TopicResultsPanel
              dailyReport={dailyReport}
              autoGenerateError={autoGenerateError}
              recommendationMode={recommendationMode}
              selectedProjectName={selectedProject ? selectedProject.name : loadingProjects ? "正在读取全案" : "全案配置中"}
              selectedKnowledgeIds={selectedKnowledgeIds}
              knowledgeEntries={knowledgeEntries}
              isGenerating={isGenerating}
              autoGenerating={autoGenerating}
              topicCards={topicCards}
              selectedTopicIndex={selectedTopicIndex}
              onGenerate={handleGenerateTopics}
              onModeChange={(mode) => {
                setRecommendationMode(mode)
                setTopicCards([])
                setDailyBriefingItems([])
                setDailyReportSources([])
                setTopicSelectionId(null)
                setSelectedTopicIndex(null)
              }}
              onSelectTopic={handleSelectTopic}
              onWriteTopic={jumpToAim}
            />

            <TopicPoolPanel
              topicChatInput={topicChatInput}
              topicChatLoading={topicChatLoading}
              topicChatReply={topicChatReply}
              knowledgeEntries={knowledgeEntries}
              forms={forms}
              savingCategory={savingCategory}
              loadingKnowledge={loadingKnowledge}
              selectedKnowledgeIds={selectedKnowledgeIds}
              onTopicChatInputChange={setTopicChatInput}
              onTopicChatSubmit={handleTopicChatSubmit}
              onFormChange={updateForm}
              onCreateKnowledge={handleCreateKnowledge}
              onToggleKnowledge={toggleKnowledgeSelection}
              onUpdateKnowledge={handleUpdateKnowledge}
              onArchiveKnowledge={handleArchiveKnowledge}
            />
          </div>
        </>
      )}
    </div>
  )
}
