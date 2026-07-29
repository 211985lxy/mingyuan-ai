import { describe, expect, it } from "vitest"
import {
  evaluateOperatingQualification,
  selectLatestConsecutiveWeeks,
  type OperatingQualificationEvidence,
  type QualificationWeek,
} from "@/lib/aim/operating-qualification"
import { WEEKLY_OUTCOME_WINDOW_POLICY } from "@/lib/aim/weekly-review"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const START = new Date("2026-06-01T00:00:00.000Z")
const EVALUATED_AT = new Date("2026-07-01T00:00:00.000Z")

function week(index: number, overrides: Partial<QualificationWeek> = {}): QualificationWeek {
  const periodStart = new Date(START.getTime() + index * WEEK_MS)
  const periodEnd = new Date(periodStart.getTime() + WEEK_MS)
  return {
    id: `cycle_${index}`,
    status: "signed",
    periodStart,
    periodEnd,
    signedAt: periodEnd,
    signedApprovalId: `approval_${index}`,
    filterSnapshot: {},
    runIdCoverage: 0.96,
    costCoverage: 0.96,
    finalDispositionCoverage: 0.96,
    generationLinkCoverage: 0.96,
    day7BackfillRate: 0.8,
    ...overrides,
  }
}

function passingEvidence(): OperatingQualificationEvidence {
  const cycles = [0, 1, 2, 3].map((index) => week(index))
  const workflowRoles = [
    "business_owner",
    "backup_owner",
    "reviewer",
  ]
  return {
    evaluatedAt: EVALUATED_AT,
    cycles,
    assignments: [
      {
        id: "system_owner",
        scopeType: "system",
        scopeId: "aim",
        role: "system_owner",
        status: "active",
        effectiveAt: new Date("2026-05-01T00:00:00.000Z"),
        hasIdentity: true,
      },
      ...[
        "sales-diagnosis-v1",
        "content-growth-v1",
        "consulting-delivery-v1",
      ].flatMap((workflowId) => workflowRoles.map((role) => ({
        id: `${workflowId}:${role}`,
        scopeType: "workflow",
        scopeId: workflowId,
        role,
        status: "active",
        effectiveAt: new Date("2026-05-01T00:00:00.000Z"),
        hasIdentity: true,
      }))),
    ],
    highRiskActions: cycles.map((cycle) => ({
      id: cycle.id,
      type: "review_cycle.sign",
      occurredAt: cycle.signedAt as Date,
      approvalBacked: true,
    })),
    formalWrites: [{
      id: "eval_1",
      type: "formal_eval.activate",
      occurredAt: new Date("2026-06-20T00:00:00.000Z"),
      approvalBacked: true,
    }],
    outcomeWindowPolicy: WEEKLY_OUTCOME_WINDOW_POLICY,
    realProjectCount: 10,
    publishedContentCount: 30,
    approvedCustomerOutcomeCount: 3,
    fullAttributionChainCount: 1,
    qualifiedLearningLoopCount: 1,
    learningLoopRefs: ["learning_source:trace:failed_run_1"],
    reusedCustomerOutcomeCaseCount: 1,
    reusedCustomerOutcomeCaseRefs: ["asset_candidate:case_1"],
    annotatedLearningSampleCount: 20,
    annotatedLearningSampleRefs: Array.from({ length: 20 }, (_, i) =>
      `learning_candidate:sample_${i}`),
  }
}

describe("operating qualification", () => {
  it("所有真实证据达到门槛时才判定 qualified", () => {
    const result = evaluateOperatingQualification(passingEvidence())
    expect(result.qualified).toBe(true)
    expect(result.periodStart).toBe("2026-06-01T00:00:00.000Z")
    expect(result.criteria.every((item) => item.passed)).toBe(true)
  })

  it("旧周报缺覆盖率时保持 unknown，不自动升级为合格", () => {
    const evidence = passingEvidence()
    evidence.cycles[0] = week(0, {
      costCoverage: null,
      finalDispositionCoverage: null,
      generationLinkCoverage: null,
    })
    const result = evaluateOperatingQualification(evidence)
    expect(result.qualified).toBe(false)
    expect(result.criteria.find((item) => item.id === "cost_coverage")?.passed)
      .toBe(false)
    expect(result.criteria.find((item) => item.id === "terminal_coverage")?.actual)
      .toContain(null)
  })

  it("未审批正式写入与不连续周报均 fail closed", () => {
    const evidence = passingEvidence()
    evidence.cycles = [week(0), week(1), week(3), week(4)]
    evidence.formalWrites[0].approvalBacked = false
    const result = evaluateOperatingQualification(evidence)
    expect(result.qualified).toBe(false)
    expect(result.criteria.find((item) =>
      item.id === "continuous_signed_reviews")?.passed).toBe(false)
    expect(result.criteria.find((item) =>
      item.id === "governed_formal_writes")?.passed).toBe(false)
  })

  it("从更长历史中只选择最新连续四周", () => {
    const evaluatedAt = new Date("2026-08-01T00:00:00.000Z")
    const selected = selectLatestConsecutiveWeeks([
      week(0),
      week(1),
      week(3),
      week(4),
      week(5),
      week(6),
    ], evaluatedAt)
    expect(selected.map((item) => item.id)).toEqual([
      "cycle_3",
      "cycle_4",
      "cycle_5",
      "cycle_6",
    ])
  })

  it("项目筛选、提前签字、未来周期不得计入资格周", () => {
    const selected = selectLatestConsecutiveWeeks([
      week(0),
      week(1, { filterSnapshot: { projectId: "proj_1" } }),
      week(1, { id: "cycle_empty_key", filterSnapshot: { projectId: "" } }),
      week(2, { signedAt: new Date(START.getTime() + 2 * WEEK_MS - 1) }),
      week(3),
      week(10, {
        periodStart: new Date("2026-08-10T00:00:00.000Z"),
        periodEnd: new Date("2026-08-17T00:00:00.000Z"),
        signedAt: new Date("2026-08-17T00:00:00.000Z"),
      }),
    ], EVALUATED_AT)
    expect(selected.map((item) => item.id)).toEqual([])
  })

  it("缺真实案例复用或人工标注样本时 fail closed", () => {
    const missingReuse = passingEvidence()
    missingReuse.reusedCustomerOutcomeCaseCount = 0
    missingReuse.reusedCustomerOutcomeCaseRefs = []
    expect(evaluateOperatingQualification(missingReuse).qualified).toBe(false)

    const missingSamples = passingEvidence()
    missingSamples.annotatedLearningSampleCount = 19
    expect(evaluateOperatingQualification(missingSamples).qualified).toBe(false)
  })
})
