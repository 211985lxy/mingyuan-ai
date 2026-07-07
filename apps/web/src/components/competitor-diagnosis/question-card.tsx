import { Lightbulb, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ConfidenceTag } from "./confidence-tag"
import { EvidenceBlock } from "./evidence-block"
import { FalsificationTable } from "./falsification-table"
import type { DiagnosisQuestion } from "@/lib/competitor-diagnosis/types"

/**
 * 五层诊断主卡：核心问题 → 一句话结论 → 证据 → 反证 → 行动建议。
 */
export function QuestionCard({ question: q }: { question: DiagnosisQuestion }) {
  return (
    <Card id={`layer-${q.questionNo}`} className="scroll-mt-20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/10">
                第 {q.questionNo} 层
              </Badge>
              <p className="text-base font-semibold">{q.layerName}</p>
            </div>
            <p className="text-sm text-muted-foreground">{q.coreQuestion}</p>
          </div>
          <ConfidenceTag level={q.confidence} className="shrink-0" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 一句话结论 */}
        <div className="rounded-lg bg-primary/5 border border-primary/15 p-3.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            一句话结论
          </p>
          <p className="text-sm font-medium leading-relaxed">{q.oneLineConclusion}</p>
        </div>

        {/* 正文要点 */}
        {q.bodySections.length > 0 && (
          <ul className="space-y-1.5">
            {q.bodySections.map((b, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span className="text-foreground/90">{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 证据 */}
        <EvidenceBlock sources={q.evidenceSource} />

        {/* 关联图表 */}
        {q.keyCharts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">关联图表：</span>
            {q.keyCharts.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-[11px]">{c}</Badge>
            ))}
          </div>
        )}

        {/* 反证表 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            这个判断可能错在哪里
          </p>
          <FalsificationTable rows={q.falsificationTable} />
        </div>

        {/* 行动建议 */}
        <div className="flex gap-2 items-start rounded-lg bg-muted/40 p-3">
          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm">{q.actionSuggestion}</p>
        </div>
      </CardContent>
    </Card>
  )
}
