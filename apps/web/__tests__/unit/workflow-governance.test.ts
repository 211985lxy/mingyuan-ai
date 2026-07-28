import { describe, expect, it } from "vitest"
import {
  assertDualSignForChange,
  assertIntegrationKeyActionAllowed,
  assertReviewerMatchesAssignment,
  assertValidApprovalForHighRisk,
  assertWorkflowGovernanceReady,
  parseApprovalDecisionInput,
  resolveIdempotentApproval,
  type GovernanceAssignmentLike,
} from "@/lib/aim/workflow-governance"
import {
  recordApprovalDecision,
  type ApprovalDecisionStorePort,
} from "@/lib/aim/approval-decision-store"

function assignment(
  overrides: Partial<GovernanceAssignmentLike> & Pick<GovernanceAssignmentLike, "role">,
): GovernanceAssignmentLike {
  return {
    scopeType: "workflow",
    scopeId: "content-growth-v1",
    userId: `user_${overrides.role}`,
    externalOpenId: `ou_${overrides.role}`,
    status: "active",
    effectiveAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

const READY: GovernanceAssignmentLike[] = [
  assignment({ role: "business_owner" }),
  assignment({ role: "backup_owner" }),
  assignment({ role: "reviewer" }),
  assignment({
    role: "system_owner",
    scopeType: "system",
    scopeId: "global",
    userId: "user_system_owner",
    externalOpenId: "ou_system_owner",
  }),
]

describe("workflow-governance fail closed", () => {
  it("缺业务 Owner → fail closed", () => {
    const rows = READY.filter((row) => row.role !== "business_owner")
    const result = assertWorkflowGovernanceReady(rows, { workflowId: "content-growth-v1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("missing_owner")
  })

  it("缺审核人 → fail closed", () => {
    const rows = READY.filter((row) => row.role !== "reviewer")
    const result = assertWorkflowGovernanceReady(rows, { workflowId: "content-growth-v1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("missing_reviewer")
  })

  it("配置齐全 → ok", () => {
    const result = assertWorkflowGovernanceReady(READY, { workflowId: "content-growth-v1" })
    expect(result.ok).toBe(true)
  })
})

describe("workflow-governance reviewer match", () => {
  it("越权 open_id → 拒绝", () => {
    const result = assertReviewerMatchesAssignment(READY, {
      workflowId: "content-growth-v1",
      externalReviewerId: "ou_stranger",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("reviewer_mismatch")
  })

  it("匿名 → 拒绝", () => {
    const result = assertReviewerMatchesAssignment(READY, {
      workflowId: "content-growth-v1",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("anonymous")
  })

  it("匹配 reviewer open_id → 通过", () => {
    const result = assertReviewerMatchesAssignment(READY, {
      workflowId: "content-growth-v1",
      externalReviewerId: "ou_reviewer",
    })
    expect(result).toEqual({ ok: true, role: "reviewer" })
  })
})

describe("workflow-governance dual sign & high risk", () => {
  it("缺系统 Owner 签 → 双签失败", () => {
    const result = assertDualSignForChange(
      [{ decision: "approve", roleSnapshot: "business_owner", subjectId: "wf_1" }],
      "wf_1",
    )
    expect(result.ok).toBe(false)
  })

  it("业务+系统双签 → 通过", () => {
    const result = assertDualSignForChange(
      [
        { decision: "approve", roleSnapshot: "business_owner", subjectId: "wf_1" },
        { decision: "approve", roleSnapshot: "system_owner", subjectId: "wf_1" },
      ],
      "wf_1",
    )
    expect(result.ok).toBe(true)
  })

  it("集成密钥不得 complete/publish/promote", () => {
    expect(assertIntegrationKeyActionAllowed("submit_review").ok).toBe(true)
    expect(assertIntegrationKeyActionAllowed("complete").ok).toBe(false)
    expect(assertIntegrationKeyActionAllowed("publish").ok).toBe(false)
    expect(assertIntegrationKeyActionAllowed("promote").ok).toBe(false)
  })

  it("complete 缺 approvalId → 拒绝", () => {
    const result = assertValidApprovalForHighRisk({
      action: "complete",
      approval: null,
      subjectType: "work_item",
      subjectId: "rec_1",
    })
    expect(result.ok).toBe(false)
  })

  it("complete 引用有效 approve → 通过", () => {
    const result = assertValidApprovalForHighRisk({
      action: "complete",
      approval: {
        id: "apd_1",
        subjectType: "work_item",
        subjectId: "rec_1",
        decision: "approve",
        roleSnapshot: "reviewer",
        reason: "通过",
        source: "feishu_card",
        requestId: "req_1",
      },
      subjectType: "work_item",
      subjectId: "rec_1",
    })
    expect(result).toEqual({ ok: true, approvalId: "apd_1" })
  })
})

describe("approval requestId idempotency", () => {
  it("同 requestId 不重复创建", async () => {
    const rows = new Map<string, ReturnType<typeof resolveIdempotentApproval>["record"]>()
    const store: ApprovalDecisionStorePort = {
      findByRequestId: async (requestId) => rows.get(requestId) ?? null,
      findById: async (id) => [...rows.values()].find((row) => row.id === id) ?? null,
      create: async (input) => {
        rows.set(input.requestId, input)
        return input
      },
    }

    const input = {
      subjectType: "work_item" as const,
      subjectId: "rec_1",
      decision: "approve" as const,
      externalReviewerId: "ou_reviewer",
      roleSnapshot: "reviewer",
      reason: "飞书卡片审核通过",
      source: "feishu_card" as const,
      requestId: "feishu:msg_1:approve",
    }

    const first = await recordApprovalDecision(store, input, () => "apd_a")
    const second = await recordApprovalDecision(store, input, () => "apd_b")
    expect(first.idempotent).toBe(false)
    expect(second.idempotent).toBe(true)
    expect(second.record.id).toBe("apd_a")
    expect(rows.size).toBe(1)
  })

  it("parseApprovalDecisionInput 校验必填", () => {
    expect(parseApprovalDecisionInput({
      subjectType: "work_item",
      subjectId: "rec_1",
      decision: "approve",
      roleSnapshot: "reviewer",
      reason: "ok",
      source: "web",
      requestId: "r1",
    })).toMatchObject({ subjectId: "rec_1" })
    expect(parseApprovalDecisionInput({ decision: "approve" })).toBeNull()
  })
})
