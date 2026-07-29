import { BUSINESS_LOOP_IDS } from "@/lib/aim/loops/contracts"
import { WEEKLY_OUTCOME_WINDOW_POLICY } from "@/lib/aim/weekly-review"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const OPERATING_QUALIFICATION_THRESHOLDS = {
  signedWeeks: 4,
  telemetryCoverage: 0.95,
  day7BackfillRate: 0.8,
  realProjects: 10,
  publishedContents: 30,
  approvedCustomerOutcomes: 3,
  fullAttributionChains: 1,
  learningLoops: 1,
} as const

export interface QualificationWeek {
  id: string
  status: string
  periodStart: Date
  periodEnd: Date
  signedAt: Date | null
  signedApprovalId: string | null
  runIdCoverage: number | null
  costCoverage: number | null
  finalDispositionCoverage: number | null
  generationLinkCoverage: number | null
  day7BackfillRate: number | null
}

export interface QualificationAssignment {
  id: string
  scopeType: string
  scopeId: string
  role: string
  status: string
  effectiveAt: Date
  hasIdentity: boolean
}

export interface GovernedActionEvidence {
  id: string
  type: string
  occurredAt: Date
  approvalBacked: boolean
}

export interface OperatingQualificationEvidence {
  evaluatedAt: Date
  cycles: QualificationWeek[]
  assignments: QualificationAssignment[]
  highRiskActions: GovernedActionEvidence[]
  formalWrites: GovernedActionEvidence[]
  outcomeWindowPolicy: string
  realProjectCount: number
  publishedContentCount: number
  approvedCustomerOutcomeCount: number
  fullAttributionChainCount: number
  qualifiedLearningLoopCount: number
  learningLoopRefs: string[]
}

export interface QualificationCriterion {
  id: string
  label: string
  passed: boolean
  actual: unknown
  threshold: string
  evidenceRefs: string[]
}

export interface OperatingQualificationResult {
  qualified: boolean
  evaluatedAt: string
  periodStart: string | null
  periodEnd: string | null
  criteria: QualificationCriterion[]
}

function criterion(
  id: string,
  label: string,
  passed: boolean,
  actual: unknown,
  threshold: string,
  evidenceRefs: string[],
): QualificationCriterion {
  return { id, label, passed, actual, threshold, evidenceRefs }
}

function validSignedWeek(cycle: QualificationWeek): boolean {
  return cycle.status === "signed"
    && cycle.signedAt != null
    && cycle.periodEnd.getTime() - cycle.periodStart.getTime() === WEEK_MS
}

/** 选择时间上最新的一段连续四周；重复周期只保留最后签字的一条。 */
export function selectLatestConsecutiveWeeks(
  cycles: QualificationWeek[],
  required = OPERATING_QUALIFICATION_THRESHOLDS.signedWeeks,
): QualificationWeek[] {
  const unique = new Map<number, QualificationWeek>()
  for (const cycle of cycles.filter(validSignedWeek)) {
    const key = cycle.periodStart.getTime()
    const current = unique.get(key)
    if (!current || (cycle.signedAt?.getTime() ?? 0) > (current.signedAt?.getTime() ?? 0)) {
      unique.set(key, cycle)
    }
  }
  const sorted = [...unique.values()].sort(
    (left, right) => left.periodStart.getTime() - right.periodStart.getTime(),
  )
  let streak: QualificationWeek[] = []
  let latest: QualificationWeek[] = []
  for (const cycle of sorted) {
    const previous = streak.at(-1)
    streak = previous?.periodEnd.getTime() === cycle.periodStart.getTime()
      ? [...streak, cycle]
      : [cycle]
    if (streak.length >= required) latest = streak.slice(-required)
  }
  return latest
}

function governanceReady(
  assignments: QualificationAssignment[],
  periodStart: Date | null,
): { passed: boolean; refs: string[] } {
  if (!periodStart) return { passed: false, refs: [] }
  const active = assignments.filter((row) =>
    row.status === "active"
    && row.hasIdentity
    && row.effectiveAt.getTime() <= periodStart.getTime())
  const refs: string[] = []
  const systemOwner = active.find((row) =>
    row.scopeType === "system" && row.role === "system_owner")
  if (systemOwner) refs.push(`governance_assignment:${systemOwner.id}`)
  const workflowReady = BUSINESS_LOOP_IDS.every((workflowId) =>
    ["business_owner", "backup_owner", "reviewer"].every((role) => {
      const row = active.find((item) =>
        item.scopeType === "workflow"
        && item.scopeId === workflowId
        && item.role === role)
      if (row) refs.push(`governance_assignment:${row.id}`)
      return Boolean(row)
    }))
  return { passed: Boolean(systemOwner) && workflowReady, refs }
}

function rateCriterion(input: {
  id: string
  label: string
  weeks: QualificationWeek[]
  key: keyof Pick<
    QualificationWeek,
    "runIdCoverage" | "costCoverage" | "finalDispositionCoverage"
    | "generationLinkCoverage" | "day7BackfillRate"
  >
  minimum: number
}) {
  const values = input.weeks.map((week) => week[input.key])
  const passed = values.length === OPERATING_QUALIFICATION_THRESHOLDS.signedWeeks
    && values.every((value) => value != null && value >= input.minimum)
  return criterion(
    input.id,
    input.label,
    passed,
    values,
    `连续 4 周每周 ≥ ${(input.minimum * 100).toFixed(0)}%`,
    input.weeks.map((week) => `review_cycle:${week.id}`),
  )
}

function governedActionsCriterion(
  actions: GovernedActionEvidence[],
  id: string,
  label: string,
  requireEvidence = true,
) {
  const backed = actions.filter((action) => action.approvalBacked).length
  const rate = actions.length ? backed / actions.length : null
  return criterion(
    id,
    label,
    actions.length === 0 ? !requireEvidence : rate === 1,
    { total: actions.length, approvalBacked: backed, rate },
    "人工签字率 100%",
    actions.map((action) => `${action.type}:${action.id}`),
  )
}

function accountabilityCriteria(
  evidence: OperatingQualificationEvidence,
  weeks: QualificationWeek[],
  periodStart: Date | null,
): QualificationCriterion[] {
  const governance = governanceReady(evidence.assignments, periodStart)
  return [
    criterion(
      "continuous_signed_reviews",
      "连续四周完成经营复盘签字",
      weeks.length === OPERATING_QUALIFICATION_THRESHOLDS.signedWeeks,
      weeks.length,
      "4 个连续、每个恰好 7 天的 signed 周期",
      weeks.map((week) => `review_cycle:${week.id}`),
    ),
    criterion(
      "workflow_accountability",
      "三条工作流责任配置持续有效",
      governance.passed,
      { workflows: BUSINESS_LOOP_IDS, assignmentCount: governance.refs.length },
      "每条工作流 business_owner/reviewer/backup_owner + system_owner",
      governance.refs,
    ),
    governedActionsCriterion(
      evidence.highRiskActions,
      "high_risk_signatures",
      "高风险动作全部有有效审批",
    ),
  ]
}

function coverageCriteria(
  weeks: QualificationWeek[],
): QualificationCriterion[] {
  const coverage = OPERATING_QUALIFICATION_THRESHOLDS.telemetryCoverage
  return [
    rateCriterion({
      id: "run_id_coverage",
      label: "运行 ID 覆盖率",
      weeks,
      key: "runIdCoverage",
      minimum: coverage,
    }),
    rateCriterion({
      id: "terminal_coverage",
      label: "任务终态覆盖率",
      weeks,
      key: "finalDispositionCoverage",
      minimum: coverage,
    }),
    rateCriterion({
      id: "cost_coverage",
      label: "任务成本覆盖率",
      weeks,
      key: "costCoverage",
      minimum: coverage,
    }),
    rateCriterion({
      id: "association_coverage",
      label: "生成关联 ID 覆盖率",
      weeks,
      key: "generationLinkCoverage",
      minimum: coverage,
    }),
    rateCriterion({
      id: "day7_backfill",
      label: "第 7 天结果回填率",
      weeks,
      key: "day7BackfillRate",
      minimum: OPERATING_QUALIFICATION_THRESHOLDS.day7BackfillRate,
    }),
  ]
}

function operatingResultCriteria(
  evidence: OperatingQualificationEvidence,
): QualificationCriterion[] {
  return [
    criterion(
      "cumulative_window_policy",
      "7/14/30 累计快照不重复计数",
      evidence.outcomeWindowPolicy === WEEKLY_OUTCOME_WINDOW_POLICY,
      evidence.outcomeWindowPolicy,
      WEEKLY_OUTCOME_WINDOW_POLICY,
      ["code_contract:weekly-review"],
    ),
    criterion(
      "real_operating_sample",
      "真实项目与发布内容达到样本门槛",
      evidence.realProjectCount >= OPERATING_QUALIFICATION_THRESHOLDS.realProjects
        && evidence.publishedContentCount
          >= OPERATING_QUALIFICATION_THRESHOLDS.publishedContents,
      {
        projects: evidence.realProjectCount,
        publishedContents: evidence.publishedContentCount,
      },
      "≥10 个有正式发布的项目且 ≥30 条发布内容",
      ["aim_generation:published"],
    ),
    criterion(
      "customer_outcomes",
      "客户结果证据完成人工验收",
      evidence.approvedCustomerOutcomeCount
        >= OPERATING_QUALIFICATION_THRESHOLDS.approvedCustomerOutcomes,
      evidence.approvedCustomerOutcomeCount,
      "≥3 条含 baseline/actual/证据/审核人的 approved 结果",
      ["customer_outcome_projection:approved"],
    ),
    criterion(
      "full_attribution_chain",
      "完整经营结果链已跑通",
      evidence.fullAttributionChainCount
        >= OPERATING_QUALIFICATION_THRESHOLDS.fullAttributionChains,
      evidence.fullAttributionChainCount,
      "≥1 条内容→线索→预约→成交→回款链",
      ["outcome_attribution:full_chain"],
    ),
  ]
}

function learningGovernanceCriteria(
  evidence: OperatingQualificationEvidence,
): QualificationCriterion[] {
  return [
    criterion(
      "learning_compound_loop",
      "真实失败推动 Eval 与方法论改善",
      evidence.qualifiedLearningLoopCount
        >= OPERATING_QUALIFICATION_THRESHOLDS.learningLoops,
      evidence.qualifiedLearningLoopCount,
      "≥1 条同源失败：active Eval 达标 + 方法论版本 published",
      evidence.learningLoopRefs,
    ),
    governedActionsCriterion(
      evidence.formalWrites,
      "governed_formal_writes",
      "正式知识、方法论与学习资产无未审批写入",
      false,
    ),
  ]
}

export function evaluateOperatingQualification(
  evidence: OperatingQualificationEvidence,
): OperatingQualificationResult {
  const weeks = selectLatestConsecutiveWeeks(evidence.cycles)
  const periodStart = weeks.at(0)?.periodStart ?? null
  const periodEnd = weeks.at(-1)?.periodEnd ?? null
  const criteria = [
    ...accountabilityCriteria(evidence, weeks, periodStart),
    ...coverageCriteria(weeks),
    ...operatingResultCriteria(evidence),
    ...learningGovernanceCriteria(evidence),
  ]
  return {
    qualified: criteria.every((item) => item.passed),
    evaluatedAt: evidence.evaluatedAt.toISOString(),
    periodStart: periodStart?.toISOString() ?? null,
    periodEnd: periodEnd?.toISOString() ?? null,
    criteria,
  }
}
