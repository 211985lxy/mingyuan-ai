"use client"

import { BookOpen, Check, Loader2, Send, Sparkles } from "lucide-react"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { categorizeTopicCards, getTopicDisplayLabel } from "@/lib/topics/display-groups"
import type { ApiTopicCard } from "@/types/api"

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

const RHETORIC_BADGE: Record<string, string> = { fu: "赋", bi: "比", xing: "兴" }
const NOVELTY_HIGH = 75
const NOVELTY_LOW = 60

const VERDICT_META: Record<NonNullable<ApiTopicCard["reviewVerdict"]>, { label: string; className: string }> = {
  strong: { label: "主推", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  usable: { label: "可用", className: "border-sky-200 bg-sky-50 text-sky-700" },
  observe: { label: "观察", className: "border-amber-200 bg-amber-50 text-amber-700" },
  revise: { label: "需优化", className: "border-rose-200 bg-rose-50 text-rose-700" },
}

function scoreEntries(card: ApiTopicCard) {
  if (!card.scoreBreakdown) return []
  return SCORE_DIMENSIONS.map(([key, label]) => ({ key, label, value: card.scoreBreakdown![key] }))
}

function TopicScoreBreakdown({ card }: { card: ApiTopicCard }) {
  const entries = scoreEntries(card)
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-5">
        {entries.map((entry) => (
          <div key={entry.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{entry.label}</span><span>{entry.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${entry.value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        强项是{sorted[0].label}，短板是{sorted[sorted.length - 1].label}。
        {card.revisionAdvice ? ` ${card.revisionAdvice}` : ""}
      </p>
    </div>
  )
}

function TopicNovelty({ card }: { card: ApiTopicCard }) {
  const detail = card.defamiliarization
  if (!detail) return null
  const score = typeof detail.noveltyScore === "number" ? detail.noveltyScore : null
  const low = score !== null && score < NOVELTY_LOW
  const barColor = score === null ? "bg-muted-foreground" : score >= NOVELTY_HIGH ? "bg-emerald-500" : low ? "bg-rose-500" : "bg-amber-500"
  const levelLabel = score === null ? "未评分" : score >= NOVELTY_HIGH ? "高含金量" : low ? "含金量偏低" : "中等"
  return (
    <div className={`mt-2 space-y-2 rounded-xl border p-3 ${low ? "border-rose-200 bg-rose-50/40" : "border-border/70 bg-muted/10"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">陌生化含金量 · {levelLabel}</span>
        {score !== null && <span className={`text-[11px] ${low ? "text-rose-600" : "text-muted-foreground"}`}>{score}</span>}
      </div>
      {score !== null && <div className="h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} /></div>}
      {detail.note ? <p className="text-xs text-muted-foreground">凭什么陌生：{detail.note}</p> : null}
      {detail.advice ? <p className={`text-xs ${low ? "text-rose-600" : "text-muted-foreground"}`}>{detail.advice}</p> : null}
    </div>
  )
}

const TRACE_SOURCE_LABELS: Record<NonNullable<ApiTopicCard["creativeTrace"]>["sources"][number]["kind"], string> = {
  benchmark: "对标爆款视频",
  product: "产品卖点",
  persona: "人设特点",
}

function TopicCreativeTrace({ card }: { card: ApiTopicCard }) {
  const trace = card.creativeTrace
  if (!trace) return null
  return (
    <details className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground/80">
        <BookOpen className="h-3.5 w-3.5" />生成依据与学习拆解
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p><span className="font-medium text-foreground">风格定位：</span>{trace.stylePositioning}</p>
          <div>
            <p className="font-medium text-foreground">推导逻辑：</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              {trace.logicSteps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}
            </ol>
          </div>
        </div>
        <div className="space-y-2">
          {trace.sources.map((source) => (
            <p key={source.kind}><span className="font-medium text-foreground">{TRACE_SOURCE_LABELS[source.kind]}：</span>{source.source}；{source.usage}</p>
          ))}
          <p><span className="font-medium text-foreground">八字依据：</span>{trace.destinyAlignment.baziBasis}</p>
          <p><span className="font-medium text-foreground">紫微依据：</span>{trace.destinyAlignment.ziweiBasis}</p>
          <p><span className="font-medium text-foreground">命理风格映射：</span>{trace.destinyAlignment.styleMapping}</p>
        </div>
      </div>
    </details>
  )
}

function TopicCardItem({ card, index, selectedIndex, onSelect, onWrite }: {
  card: ApiTopicCard
  index: number
  selectedIndex: number | null
  onSelect: (card: ApiTopicCard, index: number) => void
  onWrite: (card: ApiTopicCard, index: number) => void
}) {
  const isSelected = selectedIndex === index
  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition-colors ${isSelected ? "border-primary/30 bg-primary/[0.04]" : "border-primary/10 bg-card"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">#{index + 1}</Badge>
            {isSelected && <Badge>已采用</Badge>}
            <Badge variant="outline">{getTopicDisplayLabel(card)}</Badge>
            {typeof card.score === "number" && <Badge variant="outline">{card.score}分</Badge>}
            {card.reviewVerdict && <Badge variant="outline" className={VERDICT_META[card.reviewVerdict].className}>{VERDICT_META[card.reviewVerdict].label}</Badge>}
          </div>
          <div className="space-y-2"><h3 className="text-base font-semibold leading-6">{card.title}</h3>{card.rationale ? <p className="text-sm leading-6 text-muted-foreground">{card.rationale}</p> : null}</div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3"><p className="text-xs font-medium text-muted-foreground">为什么值得拍</p><p className="mt-1 leading-6 text-foreground">{card.scoreReason || card.contentLine || "先从这个方向切，判断会更稳。"}</p></div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3"><p className="text-xs font-medium text-muted-foreground">适合怎么讲</p><p className="mt-1 leading-6 text-foreground">{card.hook || card.angle || "先抛问题，再给判断，最后落到动作。"}</p></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {card.contentLine ? <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">{card.contentLine}</Badge> : null}
            {card.sourceType ? <Badge variant="outline">{card.sourceType}</Badge> : null}
            {card.defamiliarization?.scarcityType ? <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">{SCARCITY_BADGE[card.defamiliarization.scarcityType] ?? card.defamiliarization.scarcityType}</Badge> : null}
            {card.defamiliarization?.rhetoric ? <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">{RHETORIC_BADGE[card.defamiliarization.rhetoric] ?? card.defamiliarization.rhetoric}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:w-40">
          {isSelected ? <Button className="w-full" onClick={() => onWrite(card, index)}><Send className="mr-1 h-4 w-4" />去 AIM 写文案</Button> : <Button className="w-full" variant="outline" onClick={() => onSelect(card, index)} disabled={selectedIndex !== null}><Check className="mr-1 h-4 w-4" />采用这个选题</Button>}
        </div>
      </div>
      <TopicScoreBreakdown card={card} />
      <TopicNovelty card={card} />
      <TopicCreativeTrace card={card} />
    </div>
  )
}

interface TopicCandidatesPanelProps {
  cards: ApiTopicCard[]
  selectedIndex: number | null
  selectedKnowledgeLabels: string[]
  knowledgeCount: number
  autoGenerating: boolean
  onSelect: (card: ApiTopicCard, index: number) => void
  onWrite: (card: ApiTopicCard, index: number) => void
}

/**
 * @description topiccandidatespanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function TopicCandidatesPanel({ cards, selectedIndex, selectedKnowledgeLabels, knowledgeCount, autoGenerating, onSelect, onWrite }: TopicCandidatesPanelProps) {
  return (
    <AiResultPanel title="备选选题" icon={<Sparkles className="h-4 w-4 text-primary" />} meta={<span>今天这条不拍，再从这里换。选中后直接去 AIM 写文案。</span>} flat>
      <div className="flex flex-wrap gap-2">
        {selectedKnowledgeLabels.length === 0 ? <p className="text-sm text-muted-foreground">还没手动圈素材，系统会优先参考对标账号、拆解文案和热点；知识库 {knowledgeCount} 条素材只作补充。</p> : selectedKnowledgeLabels.map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
      </div>
      {autoGenerating ? <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在整理今日备选选题…</div> : cards.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无备选选题。</div> : (
        <div className="space-y-5">
          {categorizeTopicCards(cards).map((group) => <div key={group.key}><div className="mb-2 flex items-center gap-2"><span className="text-sm font-medium text-foreground">{group.label}</span><Badge variant="secondary" className="text-[11px]">{group.cards.length}</Badge></div><div className="grid gap-3">{group.cards.map((card) => { const index = cards.indexOf(card); return <TopicCardItem key={`${card.title}-${index}`} card={card} index={index} selectedIndex={selectedIndex} onSelect={onSelect} onWrite={onWrite} /> })}</div></div>)}
        </div>
      )}
    </AiResultPanel>
  )
}
