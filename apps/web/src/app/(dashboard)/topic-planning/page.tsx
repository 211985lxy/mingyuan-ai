"use client"

import { useEffect, useMemo, useRef, useState, startTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Check,
  Clipboard,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
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
import { buildTopicDailyReport, type TopicDailyReport, type TopicDailyReportSource } from "@/lib/topic-daily-report"
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  })
}

const SCORE_DIMENSIONS = [
  ["projectFit", "项目匹配"],
  ["contentValue", "内容价值"],
  ["viralHook", "传播钩子"],
  ["conversionFit", "成交关联"],
  ["feasibility", "可执行"],
] as const

const SCARCITY_BADGE: Record<string, string> = {
  scenery: "稀缺·景观",
  emotion: "稀缺·情感",
  beauty: "稀缺·美好",
  info: "稀缺·资讯",
  curio: "稀缺·奇闻",
  event: "稀缺·事件",
}

const RHETORIC_BADGE: Record<string, string> = {
  fu: "赋",
  bi: "比",
  xing: "兴",
}

// 含金量阈值（软门槛：标红 + 建议，不拦截"采用"）
const NOVELTY_HIGH = 75
const NOVELTY_LOW = 60

const VERDICT_META: Record<NonNullable<ApiTopicCard["reviewVerdict"]>, { label: string; className: string }> = {
  strong: { label: "主推", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  usable: { label: "可用", className: "border-sky-200 bg-sky-50 text-sky-700" },
  observe: { label: "观察", className: "border-amber-200 bg-amber-50 text-amber-700" },
  revise: { label: "需优化", className: "border-rose-200 bg-rose-50 text-rose-700" },
}

function scoreEntries(card: ApiTopicCard) {
  const breakdown = card.scoreBreakdown
  if (!breakdown) return []
  return SCORE_DIMENSIONS.map(([key, label]) => ({ key, label, value: breakdown[key] }))
}

function strongestAndWeakest(card: ApiTopicCard) {
  const entries = scoreEntries(card)
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  return { strongest: sorted[0], weakest: sorted[sorted.length - 1] }
}

// ─── 前台四分类分区 ────────────────────────────────────────

interface TopicCategoryGroup {
  key: string
  label: string
  cards: ApiTopicCard[]
}

const TOPIC_DISPLAY_GROUPS: TopicCategoryGroup[] = [
  { key: "hot_topic", label: "热点类", cards: [] },
  { key: "persona", label: "人设类", cards: [] },
  { key: "question_answer", label: "问题解答类", cards: [] },
  { key: "point_of_view", label: "观点类", cards: [] },
]

function getTopicDisplayGroupKey(card: ApiTopicCard) {
  const text = [
    card.title,
    card.rationale,
    card.contentLine,
    card.scoreReason,
  ].filter(Boolean).join(" ")

  if (/人设|身份|老板|经历|故事|信任|认识/.test(text) || card.topicType === "人设型") return "persona"
  if (/热点/.test(text) || card.sourceType === "行业热点") return "hot_topic"
  if (/观点|判断|认知|趋势|误区|反常识|立场/.test(text) || card.topicType === "流量型") return "point_of_view"
  return "question_answer"
}

function getTopicDisplayLabel(card: ApiTopicCard) {
  return TOPIC_DISPLAY_GROUPS.find((group) => group.key === getTopicDisplayGroupKey(card))?.label ?? "问题解答类"
}

function categorizeTopicCards(cards: ApiTopicCard[]): TopicCategoryGroup[] {
  const groups: TopicCategoryGroup[] = TOPIC_DISPLAY_GROUPS.map((group) => ({ ...group, cards: [] }))
  for (const card of cards) {
    groups.find((group) => group.key === getTopicDisplayGroupKey(card))?.cards.push(card)
  }

  return groups.filter((g) => g.cards.length > 0)
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
  const categorizedTopicCards = useMemo(
    () => categorizeTopicCards(topicCards),
    [topicCards],
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

              <AiResultPanel
                title="备选选题"
                icon={<Sparkles className="h-4 w-4 text-primary" />}
                meta={<span>今天这条不拍，再从这里换。选中后直接去 AIM 写文案。</span>}
                flat
              >
                  <div className="flex flex-wrap gap-2">
                    {selectedKnowledgeIds.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        还没手动圈素材，系统会优先参考对标账号、拆解文案和热点；知识库 {knowledgeEntries.length} 条素材只作补充。
                      </p>
                    ) : (
                      selectedKnowledgeIds.map((entryId) => {
                        const entry = knowledgeEntries.find((item) => item.id === entryId)
                        if (!entry) return null
                        return (
                          <Badge key={entry.id} variant="outline">
                            {CATEGORY_META[entry.category as TopicCategory]?.label ?? "素材"} · {entry.title}
                          </Badge>
                        )
                      })
                    )}
                  </div>

                  {autoGenerating ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在整理今日备选选题…
                    </div>
                  ) : topicCards.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      暂无备选选题。
                    </div>
                  ) : (
                      <div className="space-y-5">
                        {categorizedTopicCards.map((group) => (
                          <div key={group.key}>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{group.label}</span>
                              <Badge variant="secondary" className="text-[11px]">{group.cards.length}</Badge>
                            </div>
                            <div className="grid gap-3">
                              {group.cards.map((card) => {
                                const index = topicCards.indexOf(card)
                                const isSelected = selectedTopicIndex === index
                                return (
                                  <div
                                    key={`${card.title}-${index}`}
                                    className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                                      isSelected
                                        ? "border-primary/30 bg-primary/[0.04]"
                                        : "border-primary/10 bg-card"
                                    }`}
                                  >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="min-w-0 flex-1 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge variant="secondary">#{index + 1}</Badge>
                                          {isSelected && <Badge>已采用</Badge>}
                                          <Badge variant="outline">{getTopicDisplayLabel(card)}</Badge>
                                          {typeof card.score === "number" && <Badge variant="outline">{card.score}分</Badge>}
                                          {card.reviewVerdict && (
                                            <Badge variant="outline" className={VERDICT_META[card.reviewVerdict].className}>
                                              {VERDICT_META[card.reviewVerdict].label}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="space-y-2">
                                          <h3 className="text-base font-semibold leading-6">{card.title}</h3>
                                          {card.rationale ? (
                                            <p className="text-sm leading-6 text-muted-foreground">{card.rationale}</p>
                                          ) : null}
                                        </div>
                                        <div className="grid gap-3 text-sm md:grid-cols-2">
                                          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                            <p className="text-xs font-medium text-muted-foreground">为什么值得拍</p>
                                            <p className="mt-1 leading-6 text-foreground">
                                              {card.scoreReason || card.contentLine || "先从这个方向切，判断会更稳。"}
                                            </p>
                                          </div>
                                          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                            <p className="text-xs font-medium text-muted-foreground">适合怎么讲</p>
                                            <p className="mt-1 leading-6 text-foreground">
                                              {card.hook || card.angle || "先抛问题，再给判断，最后落到动作。"}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                          {card.contentLine ? (
                                            <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
                                              {card.contentLine}
                                            </Badge>
                                          ) : null}
                                          {card.sourceType ? <Badge variant="outline">{card.sourceType}</Badge> : null}
                                          {card.defamiliarization?.scarcityType ? (
                                            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                                              {SCARCITY_BADGE[card.defamiliarization.scarcityType] ?? card.defamiliarization.scarcityType}
                                            </Badge>
                                          ) : null}
                                          {card.defamiliarization?.rhetoric ? (
                                            <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                                              {RHETORIC_BADGE[card.defamiliarization.rhetoric] ?? card.defamiliarization.rhetoric}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-2 lg:w-40">
                                        {isSelected ? (
                                          <Button className="w-full" onClick={() => jumpToAim(card, index)}>
                                            <Send className="mr-1 h-4 w-4" />
                                            去 AIM 写文案
                                          </Button>
                                        ) : (
                                          <Button
                                            className="w-full"
                                            variant="outline"
                                            onClick={() => handleSelectTopic(card, index)}
                                            disabled={selectedTopicIndex !== null}
                                          >
                                            <Check className="mr-1 h-4 w-4" />
                                            采用这个选题
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    {card.scoreBreakdown ? (
                                      <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                                        <div className="grid gap-2 sm:grid-cols-5">
                                          {scoreEntries(card).map((entry) => (
                                            <div key={entry.key} className="space-y-1">
                                              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                                <span>{entry.label}</span>
                                                <span>{entry.value}</span>
                                              </div>
                                              <div className="h-1.5 rounded-full bg-muted">
                                                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${entry.value}%` }} />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        {(() => {
                                          const summary = strongestAndWeakest(card)
                                          return summary ? (
                                            <p className="text-xs text-muted-foreground">
                                              强项是{summary.strongest.label}，短板是{summary.weakest.label}。
                                              {card.revisionAdvice ? ` ${card.revisionAdvice}` : ""}
                                            </p>
                                          ) : null
                                        })()}
                                      </div>
                                    ) : null}
                                    {card.defamiliarization ? (() => {
                                      const df = card.defamiliarization
                                      const score = typeof df.noveltyScore === "number" ? df.noveltyScore : null
                                      const low = score !== null && score < NOVELTY_LOW
                                      const barColor = score === null
                                        ? "bg-muted-foreground"
                                        : score >= NOVELTY_HIGH
                                          ? "bg-emerald-500"
                                          : low
                                            ? "bg-rose-500"
                                            : "bg-amber-500"
                                      const levelLabel =
                                        score === null
                                          ? "未评分"
                                          : score >= NOVELTY_HIGH
                                            ? "高含金量"
                                            : low
                                              ? "含金量偏低"
                                              : "中等"
                                      return (
                                        <div className={`mt-2 space-y-2 rounded-xl border p-3 ${low ? "border-rose-200 bg-rose-50/40" : "border-border/70 bg-muted/10"}`}>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-medium text-muted-foreground">陌生化含金量 · {levelLabel}</span>
                                            {score !== null && <span className={`text-[11px] ${low ? "text-rose-600" : "text-muted-foreground"}`}>{score}</span>}
                                          </div>
                                          {score !== null && (
                                            <div className="h-1.5 rounded-full bg-muted">
                                              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                                            </div>
                                          )}
                                          {df.note ? (
                                            <p className="text-xs text-muted-foreground">凭什么陌生：{df.note}</p>
                                          ) : null}
                                          {df.advice ? (
                                            <p className={`text-xs ${low ? "text-rose-600" : "text-muted-foreground"}`}>{df.advice}</p>
                                          ) : null}
                                        </div>
                                      )
                                    })() : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
              </AiResultPanel>
            </div>

              <Card className="order-3 border-primary/20 bg-primary/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle>临时想法</CardTitle>
                <CardDescription>
                  丢一句客户问题、现场灵感或对标观察，先整理出方向。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={topicChatInput}
                  placeholder="比如：今天客户又问我为什么报价比别人高"
                  className="min-h-24"
                  onChange={(event) => setTopicChatInput(event.target.value)}
                />
                <div className="flex justify-end">
                  <Button onClick={handleTopicChatSubmit} disabled={topicChatLoading || !selectedProjectId}>
                    <Sparkles className="mr-1 h-4 w-4" />
                    {topicChatLoading ? "整理中..." : "整理成方向"}
                  </Button>
                </div>
                {topicChatReply ? (
                  <div className="rounded-lg border bg-background p-3 text-sm leading-6">
                    <p className="font-medium">{topicChatReply.reply.summary}</p>
                    <p className="mt-2">
                      <b>优先方向：</b>{topicChatReply.reply.recommendedTitle}
                    </p>
                    <p>
                      <b>开头：</b>{topicChatReply.reply.opening}
                    </p>
                    {topicChatReply.reply.alternatives.length > 0 ? (
                      <p>
                        <b>备选角度：</b>{topicChatReply.reply.alternatives.join("、")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

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

function TopicDailyReportEmptyState({
  error,
  onGenerate,
  disabled,
}: {
  error: string
  onGenerate: () => void
  disabled: boolean
}) {
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-500/[0.03]">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>每日选题日报</Badge>
          <Badge variant="outline">待生成</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl leading-tight">今天拍什么，还没排出来</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">
            点一下生成，先给你今天主推哪条，再补充为什么推它和还有哪些备选。
          </CardDescription>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <Button className="w-fit" onClick={onGenerate} disabled={disabled}>
          <Sparkles className="mr-1 h-4 w-4" />
          生成每日选题日报
        </Button>
      </CardHeader>
    </Card>
  )
}

function TopicDailyReportPanel({ report }: { report: TopicDailyReport }) {
  async function copyAction() {
    try {
      await navigator.clipboard.writeText(report.copyText)
      toast.success("今日行动已复制")
    } catch {
      toast.error("复制失败，请手动复制")
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-500/[0.04]">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>每日选题日报</Badge>
            {report.leadCard ? <Badge variant="secondary">{getTopicDisplayLabel(report.leadCard)}</Badge> : null}
            {typeof report.leadCard?.score === "number" ? <Badge variant="outline">{report.leadCard.score}分</Badge> : null}
            <Badge variant="outline">{report.hasSourceSnapshot ? "有证据快照" : "待补证据"}</Badge>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-primary/80">第一步 · 先看今天拍什么</p>
            <CardTitle className="text-3xl leading-tight">
              {report.leadCard ? `今天先拍「${report.leadCard.title}」` : "今天先把主推排出来"}
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {report.conclusion}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-primary/10 bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary/80">第二步 · 再看为什么是它</p>
                <CardTitle className="mt-1 text-xl">判断理由和证据</CardTitle>
              </div>
              <Badge variant="outline">{report.evidenceGroups.reduce((sum, group) => sum + group.items.length, 0)} 条</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">为什么先推这条</p>
                <p className="mt-2 text-sm leading-6">{report.reason}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">适合今天拍的原因</p>
                <p className="mt-2 text-sm leading-6">
                  {report.hasSourceSnapshot
                    ? "这条已经有项目、客户或对标证据托底，今天可以直接推进。"
                    : "这条判断已经够明确，但这次缓存还没把证据快照带出来。"}
                </p>
              </div>
            </div>

            {!report.hasSourceSnapshot ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-sm leading-6 text-amber-800">
                这次缓存没带出证据快照。要定稿，建议重新生成一次，把来源一起补齐。
              </div>
            ) : null}

            <div className="grid gap-3">
              {report.evidenceGroups.map((group) => (
                <div key={group.key} className="rounded-xl border border-border/70 bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{group.label}</Badge>
                    <span className="text-xs text-muted-foreground">{group.description}</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {group.items.map((item, index) => (
                      <div key={`${group.key}-${item.title}-${index}`} className="rounded-lg bg-muted/25 p-3">
                        <p className="text-sm font-semibold leading-5">{item.title}</p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-primary/10 bg-card">
            <CardHeader className="pb-3">
              <p className="text-sm font-medium text-primary/80">第三步 · 直接开拍</p>
              <CardTitle className="mt-1 text-xl">今天怎么讲</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4 text-sm leading-6">
                <p><b>开头：</b>{report.execution.hook}</p>
                <p className="mt-2"><b>展开：</b>{report.execution.angle}</p>
                <p className="mt-2"><b>承接：</b>{report.execution.action}</p>
              </div>
              <div className="rounded-xl bg-foreground p-4 text-background">
                <p className="text-sm leading-6">{report.copyText}</p>
                <Button className="mt-3" variant="secondary" onClick={copyAction}>
                  <Clipboard className="h-4 w-4" />
                  复制今日行动
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">如果这条不拍，再看这些</CardTitle>
              <CardDescription>保留几条最值得替补的方向，方便你快速换题。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.workshop.slice(0, 4).map((topic) => (
                <div key={`${topic.index}-${topic.title}`} className="rounded-xl border border-border/70 bg-muted/15 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">#{topic.index}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5">{topic.title}</p>
                  <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                    <p><b>开头：</b>{topic.hook}</p>
                    <p><b>角度：</b>{topic.angle}</p>
                    <p><b>承接：</b>{topic.cta}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function KnowledgeEntryCard({
  entry,
  selected,
  onToggleSelected,
  onSave,
  onArchive,
}: {
  entry: KnowledgeEntry
  selected: boolean
  onToggleSelected: () => void
  onSave: (data: { title: string; content: string }) => Promise<void>
  onArchive: () => Promise<void>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(entry.title)
  const [draftContent, setDraftContent] = useState(entry.content)
  const [isSaving, setIsSaving] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      await onSave({ title: draftTitle, content: draftContent })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleArchive() {
    setIsArchiving(true)
    try {
      await onArchive()
    } finally {
      setIsArchiving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border"
            checked={selected}
            onChange={onToggleSelected}
          />
          <div className="space-y-1">
            {isEditing ? (
              <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
            ) : (
              <p className="text-sm font-semibold">{entry.title}</p>
            )}
            <p className="text-xs text-muted-foreground">录入于 {formatDate(entry.createdAt)}</p>
          </div>
        </label>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button size="sm" variant="outline" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存"}
            </Button>
          ) : (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setDraftTitle(entry.title)
                setDraftContent(entry.content)
                setIsEditing(true)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={handleArchive} disabled={isArchiving}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        {isEditing ? (
          <Textarea
            value={draftContent}
            className="min-h-28"
            onChange={(event) => setDraftContent(event.target.value)}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {entry.content}
          </p>
        )}
      </div>
    </div>
  )
}
