import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { SectionTitle } from "./section-title"
import type { ContentStrategyData } from "@/lib/competitor-diagnosis/types"

function PercentBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | string[] }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      {Array.isArray(value) ? (
        <ul className="space-y-1">
          {value.map((v, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span className="text-foreground/90">{v}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed">{value}</p>
      )}
    </div>
  )
}

/**
 * 内容策略证据：保留并强化话题分布、内容形式、钩子、频率、时段、爆款公式。
 */
export function ContentStrategyEvidence({ data }: { data: ContentStrategyData }) {
  const hasTopic = data.topicDistribution.length > 0
  const hasFormat = data.contentFormats.length > 0

  return (
    <section className="space-y-3">
      <SectionTitle title="内容策略证据" subtitle={data.summary} anchor="content-strategy" />
      <Card>
        <CardContent className="p-5 space-y-5">
          {(hasTopic || hasFormat) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {hasTopic && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    话题分布
                  </p>
                  {data.topicDistribution.map((t) => (
                    <PercentBar key={t.topic} label={t.topic} value={t.percentage} />
                  ))}
                </div>
              )}
              {hasFormat && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    内容形式
                  </p>
                  {data.contentFormats.map((f) => (
                    <PercentBar key={f.format} label={f.format} value={f.percentage} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pt-1">
            <Field label="钩子模式" value={data.hookPatterns} />
            <Field label="发布频率" value={data.postingFrequency} />
            <Field label="最佳发布时段" value={data.bestPostingTimes} />
            <Field label="爆款公式" value={data.viralFormula} />
          </div>

          {!hasTopic && !hasFormat && !data.hookPatterns.length && !data.viralFormula && (
            <p className="text-sm text-muted-foreground">内容策略数据不足。</p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
