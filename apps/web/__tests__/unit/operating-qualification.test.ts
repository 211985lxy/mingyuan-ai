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
    evaluatedAt: new Date("2026-07-01T00:00:00.000Z"),
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
    const selected = selectLatestConsecutiveWeeks([
      week(0),
      week(1),
      week(3),
      week(4),
      week(5),
      week(6),
    ])
    expect(selected.map((item) => item.id)).toEqual([
      "cycle_3",
      "cycle_4",
      "cycle_5",
      "cycle_6",
    ])
  })
})
