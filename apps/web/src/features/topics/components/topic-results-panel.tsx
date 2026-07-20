import { Check, Loader2, Send, Sparkles, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { TopicDailyReportEmptyState, TopicDailyReportPanel } from "@/features/topics/components/topic-daily-report-panel"
import {
  CATEGORY_META,
  MODE_META,
  NOVELTY_HIGH,
  NOVELTY_LOW,
  RHETORIC_BADGE,
  SCARCITY_BADGE,
  VERDICT_META,
  type TopicCategory,
} from "@/features/topics/topic-planning-config"
import { categorizeTopicCards, getTopicDisplayLabel, scoreEntries, strongestAndWeakest } from "@/features/topics/topic-presentation"
import type { KnowledgeEntry } from "@/lib/api/client"
import type { TopicDailyReport } from "@/lib/topic-daily-report"
import type { ApiTopicCard, ApiTopicRecommendationMode } from "@/types/api"

/**
 * @description topicresultspanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function TopicResultsPanel({
  dailyReport,
  autoGenerateError,
  recommendationMode,
  selectedProjectName,
  selectedKnowledgeIds,
  knowledgeEntries,
  isGenerating,
  autoGenerating,
  topicCards,
  selectedTopicIndex,
  onGenerate,
  onModeChange,
  onSelectTopic,
  onWriteTopic,
}: {
  dailyReport: TopicDailyReport | null
  autoGenerateError: string
  recommendationMode: ApiTopicRecommendationMode
  selectedProjectName: string
  selectedKnowledgeIds: string[]
  knowledgeEntries: KnowledgeEntry[]
  isGenerating: boolean
  autoGenerating: boolean
  topicCards: ApiTopicCard[]
  selectedTopicIndex: number | null
  onGenerate: () => void
  onModeChange: (mode: ApiTopicRecommendationMode) => void
  onSelectTopic: (card: ApiTopicCard, index: number) => void
  onWriteTopic: (card: ApiTopicCard, index: number) => void
}) {
  const categorizedTopicCards = categorizeTopicCards(topicCards)

  return (
    <div className="order-1 space-y-6">
      {dailyReport ? (
        <TopicDailyReportPanel report={dailyReport} />
      ) : recommendationMode === "daily" ? (
        <TopicDailyReportEmptyState
          error={autoGenerateError}
          onGenerate={onGenerate}
          disabled={isGenerating || autoGenerating}
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
              onClick={() => onModeChange(mode as ApiTopicRecommendationMode)}
            >
              {meta.label}
            </Button>
          ))}
          <Badge variant="outline">{selectedProjectName}</Badge>
          <Badge variant="secondary">
            {selectedKnowledgeIds.length > 0 ? `已选素材 ${selectedKnowledgeIds.length} 条` : `选题池 ${knowledgeEntries.length} 条`}
          </Badge>
          <Button variant="outline" onClick={onGenerate} disabled={isGenerating || autoGenerating}>
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
          ) : selectedKnowledgeIds.map((entryId) => {
            const entry = knowledgeEntries.find((item) => item.id === entryId)
            if (!entry) return null
            return (
              <Badge key={entry.id} variant="outline">
                {CATEGORY_META[entry.category as TopicCategory]?.label ?? "素材"} · {entry.title}
              </Badge>
            )
          })}
        </div>

        {autoGenerating ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />正在整理今日备选选题…
          </div>
        ) : topicCards.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无备选选题。</div>
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
                    return (
                      <TopicCandidateCard
                        key={`${card.title}-${index}`}
                        card={card}
                        index={index}
                        selected={selectedTopicIndex === index}
                        selectionLocked={selectedTopicIndex !== null}
                        onSelect={() => onSelectTopic(card, index)}
                        onWrite={() => onWriteTopic(card, index)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </AiResultPanel>
    </div>
  )
}

function TopicCandidateCard({
  card,
  index,
  selected,
  selectionLocked,
  onSelect,
  onWrite,
}: {
  card: ApiTopicCard
  index: number
  selected: boolean
  selectionLocked: boolean
  onSelect: () => void
  onWrite: () => void
}) {
  const noveltyScore = typeof card.defamiliarization?.noveltyScore === "number" ? card.defamiliarization.noveltyScore : null
  const noveltyLow = noveltyScore !== null && noveltyScore < NOVELTY_LOW
  const noveltyBar = noveltyScore === null ? "bg-muted-foreground" : noveltyScore >= NOVELTY_HIGH ? "bg-emerald-500" : noveltyLow ? "bg-rose-500" : "bg-amber-500"
  const noveltyLabel = noveltyScore === null ? "未评分" : noveltyScore >= NOVELTY_HIGH ? "高含金量" : noveltyLow ? "含金量偏低" : "中等"
  const scoreSummary = strongestAndWeakest(card)

  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition-colors ${selected ? "border-primary/30 bg-primary/[0.04]" : "border-primary/10 bg-card"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">#{index + 1}</Badge>
            {selected && <Badge>已采用</Badge>}
            <Badge variant="outline">{getTopicDisplayLabel(card)}</Badge>
            {typeof card.score === "number" && <Badge variant="outline">{card.score}分</Badge>}
            {card.reviewVerdict && <Badge variant="outline" className={VERDICT_META[card.reviewVerdict].className}>{VERDICT_META[card.reviewVerdict].label}</Badge>}
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-semibold leading-6">{card.title}</h3>
            {card.rationale ? <p className="text-sm leading-6 text-muted-foreground">{card.rationale}</p> : null}
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <TopicReason label="为什么值得拍" text={card.scoreReason || card.contentLine || "先从这个方向切，判断会更稳。"} />
            <TopicReason label="适合怎么讲" text={card.hook || card.angle || "先抛问题，再给判断，最后落到动作。"} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {card.contentLine ? <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">{card.contentLine}</Badge> : null}
            {card.sourceType ? <Badge variant="outline">{card.sourceType}</Badge> : null}
            {card.defamiliarization?.scarcityType ? <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">{SCARCITY_BADGE[card.defamiliarization.scarcityType] ?? card.defamiliarization.scarcityType}</Badge> : null}
            {card.defamiliarization?.rhetoric ? <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">{RHETORIC_BADGE[card.defamiliarization.rhetoric] ?? card.defamiliarization.rhetoric}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:w-40">
          {selected ? (
            <Button className="w-full" onClick={onWrite}><Send className="mr-1 h-4 w-4" />去 AIM 写文案</Button>
          ) : (
            <Button className="w-full" variant="outline" onClick={onSelect} disabled={selectionLocked}><Check className="mr-1 h-4 w-4" />采用这个选题</Button>
          )}
        </div>
      </div>

      {card.scoreBreakdown ? (
        <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-5">
            {scoreEntries(card).map((entry) => (
              <div key={entry.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{entry.label}</span><span>{entry.value}</span></div>
                <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${entry.value}%` }} /></div>
              </div>
            ))}
          </div>
          {scoreSummary ? <p className="text-xs text-muted-foreground">强项是{scoreSummary.strongest.label}，短板是{scoreSummary.weakest.label}。{card.revisionAdvice ? ` ${card.revisionAdvice}` : ""}</p> : null}
        </div>
      ) : null}

      {card.defamiliarization ? (
        <div className={`mt-2 space-y-2 rounded-xl border p-3 ${noveltyLow ? "border-rose-200 bg-rose-50/40" : "border-border/70 bg-muted/10"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">陌生化含金量 · {noveltyLabel}</span>
            {noveltyScore !== null && <span className={`text-[11px] ${noveltyLow ? "text-rose-600" : "text-muted-foreground"}`}>{noveltyScore}</span>}
          </div>
          {noveltyScore !== null && <div className="h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${noveltyBar}`} style={{ width: `${noveltyScore}%` }} /></div>}
          {card.defamiliarization.note ? <p className="text-xs text-muted-foreground">凭什么陌生：{card.defamiliarization.note}</p> : null}
          {card.defamiliarization.advice ? <p className={`text-xs ${noveltyLow ? "text-rose-600" : "text-muted-foreground"}`}>{card.defamiliarization.advice}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function TopicReason({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 leading-6 text-foreground">{text}</p>
    </div>
  )
}
