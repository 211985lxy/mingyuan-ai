/**
 * 内容生成基线比较（14 周正本阶段 1）。
 * CLI 与单测共用，避免测试直接依赖 scripts/。
 */

export interface ContentGenerationBaseline {
  version: 1
  capturedAt: string
  source: "manual" | "ops_export" | "template"
  windowLabel: string
  metrics: {
    acceptanceRate: number | null
    rewriteRate: number | null
    evidenceCompletenessRate: number | null
    severeFabricationRate: number | null
    avgLatencyMs: number | null
    avgCostCny: number | null
    sampleSize: number | null
  }
  notes: string[]
}

export const CONTENT_BASELINE_REGRESSION_PP = 5

export function createTemplateBaseline(): ContentGenerationBaseline {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    source: "template",
    windowLabel: "待补齐：近 14 天内容生成运营窗口",
    metrics: {
      acceptanceRate: null,
      rewriteRate: null,
      evidenceCompletenessRate: null,
      severeFabricationRate: null,
      avgLatencyMs: null,
      avgCostCny: null,
      sampleSize: null,
    },
    notes: [
      "正式灰度前须用真实接受/重写数据覆盖本模板。",
      "严重虚构率必须为 0 才能宣称生产闭环。",
      `新版本相对基线质量下降不得超过 ${CONTENT_BASELINE_REGRESSION_PP} 个百分点。`,
    ],
  }
}

export function compareAgainstBaseline(
  baseline: ContentGenerationBaseline,
  candidate: ContentGenerationBaseline,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const keys = ["acceptanceRate", "evidenceCompletenessRate"] as const
  for (const key of keys) {
    const base = baseline.metrics[key]
    const next = candidate.metrics[key]
    if (base == null || next == null) {
      reasons.push(`${key} 缺少可比数值`)
      continue
    }
    const dropPp = (base - next) * 100
    if (dropPp > CONTENT_BASELINE_REGRESSION_PP) {
      reasons.push(`${key} 相对基线下降 ${dropPp.toFixed(1)}pp > ${CONTENT_BASELINE_REGRESSION_PP}pp`)
    }
  }
  if ((candidate.metrics.severeFabricationRate ?? 0) > 0) {
    reasons.push("severeFabricationRate 必须为 0")
  }
  return { ok: reasons.length === 0, reasons }
}

export function renderContentBaselineMarkdown(baseline: ContentGenerationBaseline): string {
  const m = baseline.metrics
  const pct = (v: number | null) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`)
  return [
    `# Content Generation Baseline`,
    "",
    `- Captured: ${baseline.capturedAt}`,
    `- Source: ${baseline.source}`,
    `- Window: ${baseline.windowLabel}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| acceptanceRate | ${pct(m.acceptanceRate)} |`,
    `| rewriteRate | ${pct(m.rewriteRate)} |`,
    `| evidenceCompletenessRate | ${pct(m.evidenceCompletenessRate)} |`,
    `| severeFabricationRate | ${pct(m.severeFabricationRate)} |`,
    `| avgLatencyMs | ${m.avgLatencyMs ?? "n/a"} |`,
    `| avgCostCny | ${m.avgCostCny ?? "n/a"} |`,
    `| sampleSize | ${m.sampleSize ?? "n/a"} |`,
    "",
    "## Notes",
    "",
    ...baseline.notes.map((note) => `- ${note}`),
  ].join("\n")
}
