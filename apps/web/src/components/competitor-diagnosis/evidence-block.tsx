/**
 * 证据框：挂在每个判断之后，说明"结论由哪些证据支撑"。
 * sources  = 证据来源清单（数据字段/指标名）
 * metrics  = 关键数值（label/value 已格式化）
 * quotes   = 原文摘录
 */
/**
 * @description evidenceblock
 * @param options - 配置选项
 * @returns 无返回值
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

  const visibleSources = sources.slice(0, 4)
  const hiddenSourceCount = Math.max(0, sources.length - visibleSources.length)

  return (
    <div className="space-y-2">
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">证据</span>
          {visibleSources.map((source, index) => (
            <span
              key={index}
              className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/80"
            >
              {source}
            </span>
          ))}
          {hiddenSourceCount > 0 && (
            <span className="text-[11px] text-muted-foreground">+{hiddenSourceCount}</span>
          )}
        </div>
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
