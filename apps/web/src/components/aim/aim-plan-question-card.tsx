"use client"

import { useState } from "react"
import { Check, ChevronLeft, Loader2, PenLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PlanQuestion } from "@/lib/aim/plan-types"

interface AimPlanQuestionCardProps {
  question: PlanQuestion
  questionNumber: number
  totalQuestions: number
  loading: boolean
  canGoBack: boolean
  onSelectOption: (questionId: string, key: "A" | "B" | "C") => void
  onSelectCustom: (questionId: string, customText: string) => void
  onGoBack: () => void
}

/**
 * 计划模式 · 对话式问题卡片
 *
 * 一次展示一题，单选；A/B/C 为档案驱动推荐（附来源标签），
 * D 为"都不符合，我来补充"，选择后展开输入框，填写并确认后直接进入下一题。
 * 不复用 Markdown A–D 解析器，使用结构化数据驱动交互。
 */
export function AimPlanQuestionCard({
  question,
  questionNumber,
  totalQuestions,
  loading,
  canGoBack,
  onSelectOption,
  onSelectCustom,
  onGoBack,
}: AimPlanQuestionCardProps) {
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState("")

  const handleCustomConfirm = () => {
    const trimmed = customText.trim()
    if (!trimmed) return
    onSelectCustom(question.id, trimmed)
    setCustomMode(false)
    setCustomText("")
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-primary/20 bg-card shadow-sm">
        <PlanQuestionProgress questionNumber={questionNumber} totalQuestions={totalQuestions} canGoBack={canGoBack} onGoBack={onGoBack} />
        <div className="px-4 pt-3 pb-2"><p className="text-sm font-medium leading-relaxed">{question.prompt}</p></div>

        {/* 选项列表 */}
        <div className="flex flex-col gap-2 px-4 pb-3">
          <PlanQuestionOptions question={question} loading={loading} onSelect={onSelectOption} />

          {/* D 选项：都不符合，我来补充 */}
          <PlanCustomOption customMode={customMode} customText={customText} loading={loading} setCustomMode={setCustomMode} setCustomText={setCustomText} onConfirm={handleCustomConfirm} />
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="flex items-center justify-center gap-2 border-t px-4 py-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">正在读取项目档案…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanQuestionProgress({ questionNumber, totalQuestions, canGoBack, onGoBack }: {
  questionNumber: number; totalQuestions: number; canGoBack: boolean; onGoBack: () => void
}) {
  return <div className="flex items-center gap-2 border-b px-4 py-2.5">
    {canGoBack ? <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onGoBack} title="返回上一题"><ChevronLeft className="h-3.5 w-3.5" /></Button> : null}
    <span className="text-xs font-medium text-muted-foreground">问题 {questionNumber}{totalQuestions > 0 ? ` / ${totalQuestions}` : ""}</span>
    <div className="ml-auto flex gap-1">{Array.from({ length: Math.max(totalQuestions, questionNumber) }).map((_, i) => <span key={i} className={`h-1.5 w-4 rounded-full transition-colors ${i < questionNumber - 1 ? "bg-primary" : i === questionNumber - 1 ? "bg-primary/60" : "bg-muted"}`} />)}</div>
  </div>
}

function PlanCustomOption({ customMode, customText, loading, setCustomMode, setCustomText, onConfirm }: {
  customMode: boolean; customText: string; loading: boolean
  setCustomMode: (value: boolean) => void; setCustomText: (value: string) => void; onConfirm: () => void
}) {
  if (!customMode) return <button type="button" disabled={loading} className="group flex w-full items-center gap-3 rounded-lg border border-dashed border-border/60 px-3.5 py-2.5 text-left transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50" onClick={() => setCustomMode(true)}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/30 text-[11px] font-semibold text-muted-foreground">D</span><span className="flex items-center gap-1.5 text-sm text-muted-foreground"><PenLine className="h-3.5 w-3.5" />都不符合，我来补充</span></button>
  return <div className="rounded-lg border border-primary/30 bg-primary/5 p-3"><textarea value={customText} onChange={(e) => setCustomText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onConfirm() } }} placeholder="输入你的想法…" rows={2} autoFocus className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60" /><div className="mt-2 flex items-center justify-end gap-2"><Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setCustomMode(false); setCustomText("") }}>取消</Button><Button type="button" size="sm" className="h-7 gap-1 text-xs" disabled={!customText.trim()} onClick={onConfirm}><Check className="h-3 w-3" />确认</Button></div></div>
}

function PlanQuestionOptions({ question, loading, onSelect }: {
  question: PlanQuestion
  loading: boolean
  onSelect: AimPlanQuestionCardProps["onSelectOption"]
}) {
  return <>{question.options.map((option) => (
    <button
      key={option.key}
      type="button"
      disabled={loading}
      className="group flex w-full items-start gap-3 rounded-lg border border-border/60 bg-background px-3.5 py-2.5 text-left transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
      onClick={() => onSelect(question.id, option.key)}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
        {option.key}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-relaxed">{option.text}</span>
        {option.sourceRefs.length > 0 && <span className="mt-1 flex flex-wrap gap-1">
          {option.sourceRefs.map((ref, i) => <Badge key={i} variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">来自：{ref.label}</Badge>)}
        </span>}
      </span>
    </button>
  ))}</>
}
