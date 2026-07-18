"use client"

import { useEffect, useMemo, useRef, useState, startTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ExternalLink,
  Plus,
  Sparkles,
  Target,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { KnowledgeEntryCard } from "@/components/topic-planning/knowledge-entry-card"
import { TopicCandidatesPanel } from "@/components/topic-planning/topic-candidates-panel"
import { TopicChatCard } from "@/components/topic-planning/topic-chat-card"
import {
  TopicDailyReportEmptyState,
  TopicDailyReportPanel,
} from "@/components/topic-planning/topic-daily-report"
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

type TopicCategory = "daily_inspiration" | "meeting_minutes" | "benchmark_reference" | "user_insight"

const CATEGORY_META: Record<
  TopicCategory,
  {
    label: string
    description: string
    titlePlaceholder: string
    contentPlaceholder: string
  }
> = {
  daily_inspiration: {
    label: "日常灵感",
    description: "老板随口一句、客户现场一句话、想到的切入角度，都先收进来。",
    titlePlaceholder: "例如：老板晨会金句",
    contentPlaceholder: "记录原话、场景或你想到的选题切口。",
  },
  meeting_minutes: {
    label: "会议纪要",
    description: "把客户访谈、内部复盘、项目会议纪要粘贴进来，提炼真实问题和可拍选题。",
    titlePlaceholder: "例如：7月客户复盘会",
    contentPlaceholder: "粘贴会议纪要、访谈记录、讨论要点。保留原话、问题、分歧、案例和下一步动作。",
  },
  benchmark_reference: {
    label: "参考素材",
    description: "人工粘贴优质账号链接、爆款标题、开头方式或结构拆解。",
    titlePlaceholder: "例如：某优质账号爆款开头",
    contentPlaceholder: "贴链接、标题、开头文案，或你观察到的结构节奏。",
  },
  user_insight: {
    label: "用户洞察",
    description: "来自客户在选题策划和总聊天框里的真实输入，系统沉淀后再进入选题。",
    titlePlaceholder: "",
    contentPlaceholder: "",
  },
}

const CATEGORY_ORDER: TopicCategory[] = [
  "daily_inspiration",
  "meeting_minutes",
  "benchmark_reference",
  "user_insight",
]

const MODE_META: Record<ApiTopicRecommendationMode, { label: string; description: string }> = {
  normal: {
    label: "常规选题",
    description: "基于现有素材，给你一组能直接判断的选题。",
  },
  daily: {
    label: "每日选题日报",
    description: "先告诉你今天主推哪条，再补充原因和备选。",
  },
  weekly: {
    label: "本周选题",
    description: "把本周值得拍的方向先排出来，方便继续筛。",
  },
}

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
  const [forms, setForms] = useState<Record<TopicCategory, { title: string; content: string }>>({
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

  // ─── 自动生成：进页/切换项目后，若今天没有 daily 缓存则自动生成 ──
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
        // missing → 自动生成
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

  const groupedEntries = CATEGORY_ORDER.map((category) => ({
    category,
    items: knowledgeEntries.filter((entry) => entry.category === category),
  }))
  const dailyReport = useMemo(
    () => recommendationMode === "daily" && topicCards.length > 0
      ? buildTopicDailyReport(topicCards, dailyBriefingItems, recommendationMode, dailyReportSources)
      : null,
    [dailyBriefingItems, dailyReportSources, recommendationMode, topicCards],
  )
  const selectedKnowledgeLabels = selectedKnowledgeIds.flatMap((entryId) => {
    const entry = knowledgeEntries.find((item) => item.id === entryId)
    return entry ? [`${CATEGORY_META[entry.category as TopicCategory]?.label ?? "素材"} · ${entry.title}`] : []
  })

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
            <div className="order-1 space-y-6">
              {dailyReport ? (
                <TopicDailyReportPanel report={dailyReport} />
              ) : recommendationMode === "daily" ? (
                <TopicDailyReportEmptyState
                  error={autoGenerateError}
                  onGenerate={handleGenerateTopics}
                  disabled={!selectedProjectId || isGenerating || autoGenerating}
                />
              ) : null}

              <AiResultPanel
                title="选题设置"
                icon={<Target className="h-4 w-4 text-primary" />}
                meta={<span>{MODE_META[recommendationMode].description}</span>}
                contentClassName="flex flex-wrap items-center justify-between gap-3 p-4"
                flat
              >
                <div className="flex flex-wrap items-center gap-2">
                  {Object.entries(MODE_META).map(([mode, meta]) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={recommendationMode === mode ? "default" : "outline"}
                      onClick={() => {
                        setRecommendationMode(mode as ApiTopicRecommendationMode)
                        setTopicCards([])
                        setDailyBriefingItems([])
                        setDailyReportSources([])
                        setTopicSelectionId(null)
                        setSelectedTopicIndex(null)
                      }}
                    >
                      {meta.label}
                    </Button>
                  ))}
                  <Badge variant="outline">{selectedProject ? selectedProject.name : loadingProjects ? "正在读取全案" : "全案配置中"}</Badge>
                  <Badge variant="secondary">
                    {selectedKnowledgeIds.length > 0 ? `已选素材 ${selectedKnowledgeIds.length} 条` : `选题池 ${knowledgeEntries.length} 条`}
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={handleGenerateTopics}
                    disabled={!selectedProjectId || isGenerating || autoGenerating}
                  >
                    <Sparkles className="mr-1 h-4 w-4" />
                    {isGenerating || autoGenerating ? "生成中..." : topicCards.length > 0 ? "重新生成" : `生成${MODE_META[recommendationMode].label}`}
                  </Button>
                </div>
              </AiResultPanel>

              <TopicCandidatesPanel
                cards={topicCards}
                selectedIndex={selectedTopicIndex}
                selectedKnowledgeLabels={selectedKnowledgeLabels}
                knowledgeCount={knowledgeEntries.length}
                autoGenerating={autoGenerating}
                onSelect={handleSelectTopic}
                onWrite={jumpToAim}
              />
            </div>

            <TopicChatCard
              value={topicChatInput}
              loading={topicChatLoading}
              disabled={!selectedProjectId}
              reply={topicChatReply}
              onChange={setTopicChatInput}
              onSubmit={handleTopicChatSubmit}
            />

            <div className="order-4 rounded-xl border bg-muted/20 p-3 text-sm opacity-80">
              <div className="font-medium text-muted-foreground">
                选题池 {knowledgeEntries.length} 条
              </div>
              <div className="mt-4 space-y-4">
                {groupedEntries.map(({ category, items }) => (
                <Card key={category} className="shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle>{CATEGORY_META[category].label}</CardTitle>
                        <CardDescription>{CATEGORY_META[category].description}</CardDescription>
                      </div>
                      <Badge variant="secondary">{items.length} 条</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {category === "user_insight" ? (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                        客户在选题策划或总聊天框里提到的偏好、顾虑和真实问题，会沉淀到这里。
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <div className="space-y-2">
                          <Label>标题</Label>
                          <Input
                            value={forms[category].title}
                            placeholder={CATEGORY_META[category].titlePlaceholder}
                            onChange={(event) => updateForm(category, "title", event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>内容</Label>
                          <Textarea
                            value={forms[category].content}
                            placeholder={CATEGORY_META[category].contentPlaceholder}
                            className="min-h-28"
                            onChange={(event) => updateForm(category, "content", event.target.value)}
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            onClick={() => handleCreateKnowledge(category)}
                            disabled={savingCategory === category}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            {savingCategory === category ? "保存中..." : "加入选题池"}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 border-t pt-4">
                      {loadingKnowledge ? (
                        <p className="text-sm text-muted-foreground">正在读取项目素材...</p>
                      ) : items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {category === "user_insight"
                            ? "还没有沉淀到用户洞察。客户多聊几轮后，可以从对话里提炼出来。"
                            : "这个分类还没有素材，先录一条，后面生成选题时就能直接带进去。"}
                        </p>
                      ) : (
                        items.map((entry) => (
                          <KnowledgeEntryCard
                            key={entry.id}
                            entry={entry}
                            selected={selectedKnowledgeIds.includes(entry.id)}
                            onToggleSelected={() => toggleKnowledgeSelection(entry.id)}
                            onSave={(data) => handleUpdateKnowledge(entry.id, data)}
                            onArchive={() => handleArchiveKnowledge(entry.id)}
                          />
                        ))
                      )}
                    </div>
                  </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="order-5 grid gap-3 md:grid-cols-2">
              <Link href="/ai-hot" className="block">
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-foreground">全网热点洞察</p>
                      <p className="mt-1 text-sm text-muted-foreground">查看当天热点、行业信号和可用线索，再收进选题池。</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
              <Link href="/competitor" className="block">
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-foreground">竞品研究</p>
                      <p className="mt-1 text-sm text-muted-foreground">查看对标账号、爆款作品和趋势证据。</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
