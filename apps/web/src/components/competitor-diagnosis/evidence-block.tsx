/**
 * 证据框：挂在每个判断之后，说明"结论由哪些证据支撑"。
 * sources  = 证据来源清单（数据字段/指标名）
 * metrics  = 关键数值（label/value 已格式化）
 * quotes   = 原文摘录
 */
export function EvidenceBlock({
  sources,
  metrics,
  quotes,
}: {
  sources: string[]
  metrics?: Array<{ label: string; value: string }>
  quotes?: string[]
}) {
  if (!sources.length && !metrics?.length && !quotes?.length) return null

  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        证据来源
      </p>

      {sources.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {sources.map((s, i) => (
            <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}

      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-md bg-background/60 px-2.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
              <p className="text-sm font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {quotes && quotes.length > 0 && (
        <ul className="space-y-1.5">
          {quotes.map((q, i) => (
            <li
              key={i}
              className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-2"
            >
              {q}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
