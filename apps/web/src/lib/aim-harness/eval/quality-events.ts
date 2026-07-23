/**
 * 用户质量事件与 eval A/B 对齐的指标键。
 * 线上事件写入 /api/aim/runs/[runId]/events；每轮提示词改动后对比：
 *   - too_generic 占比下降
 *   - rewrite_requested 占比下降
 *   - structure_mismatch / fact_inaccurate 不上升
 */

export const AIM_PROMPT_QUALITY_EVENT_REASONS = [
  "too_generic",
  "rewrite_requested",
  "tone_mismatch",
  "structure_mismatch",
  "fact_inaccurate",
  "conversion_weak",
  "missing_evidence",
] as const

export type AimPromptQualityEventReason = (typeof AIM_PROMPT_QUALITY_EVENT_REASONS)[number]

export interface PromptQualityAbSummary {
  label: "baseline" | "treatment"
  fixtureCount: number
  routingPassRate: number
  taskSpecFieldPassRate: number
  groundFactPassRate: number
  /** 代理指标：fixture 中 banned / scope 失败视作质量风险 */
  qualityRiskRate: number
}

/**
 * 汇总 gradeFixture 结果，供 baseline / treatment A/B 对比。
 */
export function summarizePromptQualityAb(
  label: "baseline" | "treatment",
  results: Array<{ passed: boolean; assertions: Array<{ name: string; passed: boolean }> }>,
): PromptQualityAbSummary {
  const fixtureCount = results.length
  const rate = (name: string) => {
    const relevant = results.flatMap((r) => r.assertions.filter((a) => a.name === name))
    if (!relevant.length) return 1
    return relevant.filter((a) => a.passed).length / relevant.length
  }
  const routingPassRate = rate("runtime_task")
  const taskSpecFieldPassRate = rate("taskspec_fields_in_prompt")
  const groundFactPassRate = rate("ground_in_seed_facts")
  const riskAssertions = results.flatMap((r) =>
    r.assertions.filter((a) =>
      a.name === "no_banned_substrings" || a.name === "max_scope_opening_only",
    ),
  )
  const qualityRiskRate = riskAssertions.length
    ? riskAssertions.filter((a) => !a.passed).length / riskAssertions.length
    : 0

  return {
    label,
    fixtureCount,
    routingPassRate,
    taskSpecFieldPassRate,
    groundFactPassRate,
    qualityRiskRate,
  }
}
