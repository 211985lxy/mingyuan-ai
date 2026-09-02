/**
 * 对标拆解 → 「爆款方法论」页（双资产之二）
 *
 * 竞品验证过的模式：对标账号拆出的「怎么写」沉淀为命名资产，
 * 之后和 IP 档案一起整块进入生成上下文（AOT 定位底盘已包含
 * viral_methodology 页型），模型不靠临场猜打法。
 * 存储复用 IP Wiki 页（同类型归档、版本递增），不建第二套存储。
 */

export interface BenchmarkMethodologyInput {
  sourceOriginalText?: string | null
  sourceAnalysisText?: string | null
  sourceTopicTitle?: string | null
}

export interface BenchmarkMethodologyPage {
  pageType: "viral_methodology"
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: Array<Record<string, unknown>>
  links: string[]
}

export function hasBenchmarkMethodologyMaterial(input: BenchmarkMethodologyInput): boolean {
  return Boolean((input.sourceAnalysisText ?? "").trim() || (input.sourceOriginalText ?? "").trim())
}

/** 组装爆款方法论页：对标原文 + 结构拆解（怎么写），缺哪块就只写哪块 */
export function buildBenchmarkMethodologyPage(
  input: BenchmarkMethodologyInput,
): BenchmarkMethodologyPage | null {
  const original = (input.sourceOriginalText ?? "").trim()
  const analysis = (input.sourceAnalysisText ?? "").trim()
  if (!original && !analysis) return null

  const sections: string[] = []
  if (original) sections.push(`## 对标原文\n${original}`)
  if (analysis) sections.push(`## 结构拆解（怎么写）\n${analysis}`)

  const topic = (input.sourceTopicTitle ?? "").trim()
  const fallbackTitle = original.slice(0, 12) || analysis.slice(0, 12)
  const title = `爆款方法论·${topic || fallbackTitle || "未命名对标"}`.slice(0, 120)

  return {
    pageType: "viral_methodology",
    title,
    content: sections.join("\n\n").slice(0, 8000),
    frontmatter: { origin: "benchmark_save" },
    sources: [],
    links: [],
  }
}
