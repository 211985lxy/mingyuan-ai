import { describe, expect, it, vi } from "vitest"
import {
  assertDualSignForChange,
  assertIntegrationKeyActionAllowed,
  assertReviewerMatchesAssignment,
  assertValidApprovalForHighRisk,
  assertWorkflowGovernanceReady,
  parseApprovalDecisionInput,
  resolveIdempotentApproval,
  type ApprovalDecisionRecord,
  type GovernanceAssignmentLike,
} from "@/lib/aim/workflow-governance"
import {
  recordApprovalDecision,
  type ApprovalDecisionStorePort,
} from "@/lib/aim/approval-decision-store"
import { processFeishuCardApproval } from "@/lib/aim/approval-completion"
import type { WorkItemRecordStore } from "@/lib/aim/services/work-item-execution"

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

function memoryStore(): ApprovalDecisionStorePort & {
  rows: Map<string, ApprovalDecisionRecord>
} {
  const rows = new Map<string, ApprovalDecisionRecord>()
  return {
    rows,
    findByRequestId: async (requestId) =>
      [...rows.values()].find((row) => row.requestId === requestId) ?? null,
    findById: async (id) => rows.get(id) ?? null,
    findBySubject: async (subjectType, subjectId) =>
      [...rows.values()].filter(
        (row) => row.subjectType === subjectType && row.subjectId === subjectId,
      ),
    create: async (input) => {
      if ([...rows.values()].some((row) => row.requestId === input.requestId)) {
        const err = new Error("Unique constraint") as Error & { code: string }
        err.code = "P2002"
        throw err
      }
      const record: ApprovalDecisionRecord = {
        ...input,
        effectStatus: input.effectStatus ?? "none",
      }
      rows.set(record.id, record)
      return record
    },
    updateEffect: async (id, patch) => {
      const existing = rows.get(id)
      if (!existing) throw new Error("missing")
      const next = {
        ...existing,
        effectStatus: patch.effectStatus,
        effectError: patch.effectError ?? null,
      }
      rows.set(id, next)
      return next
    },
  }
}

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

  it("缺系统 Owner → fail closed", () => {
    const rows = READY.filter((row) => row.role !== "system_owner")
    const result = assertWorkflowGovernanceReady(rows, { workflowId: "content-growth-v1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("missing_owner")
  })

  it("跨工作流配置不生效 → fail closed", () => {
    const rows = READY.map((row) =>
      row.scopeType === "workflow" ? { ...row, scopeId: "other-workflow" } : row,
    )
    const result = assertWorkflowGovernanceReady(rows, { workflowId: "content-growth-v1" })
    expect(result.ok).toBe(false)
  })

  it("配置齐全 → ok", () => {
    const result = assertWorkflowGovernanceReady(READY, { workflowId: "content-growth-v1" })
    expect(result.ok).toBe(true)
  })
})

describe("workflow-governance reviewer match 反例", () => {
  it("越权 open_id → 拒绝", () => {
    const result = assertReviewerMatchesAssignment(READY, {
      workflowId: "content-growth-v1",
      externalReviewerId: "ou_stranger",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("reviewer_mismatch")
  })

  it("伪造 open_id（其它工作流角色）→ 拒绝", () => {
    const other = assignment({
      role: "reviewer",
      scopeId: "sales-diagnosis-v1",
      externalOpenId: "ou_sales_reviewer",
    })
    const result = assertReviewerMatchesAssignment([...READY, other], {
      workflowId: "content-growth-v1",
      externalReviewerId: "ou_sales_reviewer",
    })
    expect(result.ok).toBe(false)
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
  it("少一签 → 双签失败", () => {
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
    expect(assertIntegrationKeyActionAllowed("start").ok).toBe(true)
    expect(assertIntegrationKeyActionAllowed("fail").ok).toBe(true)
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

  it("拒绝审批 → 拒绝执行", () => {
    const result = assertValidApprovalForHighRisk({
      action: "complete",
      approval: {
        id: "apd_rej",
        subjectType: "work_item",
        subjectId: "rec_1",
        decision: "reject",
        roleSnapshot: "reviewer",
        reason: "不通过",
        source: "feishu_card",
        requestId: "req_rej",
        effectStatus: "applied",
        decidedAt: new Date(),
      },
      subjectType: "work_item",
      subjectId: "rec_1",
    })
    expect(result.ok).toBe(false)
  })

  it("过期审批 → 拒绝", () => {
    const result = assertValidApprovalForHighRisk({
      action: "promote",
      approval: {
        id: "apd_old",
        subjectType: "asset",
        subjectId: "asset_1",
        decision: "approve",
        roleSnapshot: "reviewer",
        reason: "ok",
        source: "web",
        requestId: "req_old",
        effectStatus: "none",
        decidedAt: new Date("2020-01-01T00:00:00Z"),
      },
      subjectType: "asset",
      subjectId: "asset_1",
      at: new Date("2026-07-29T00:00:00Z"),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/过期/)
  })

  it("跨项目 approval → 拒绝", () => {
    const result = assertValidApprovalForHighRisk({
      action: "promote",
      approval: {
        id: "apd_x",
        subjectType: "asset",
        subjectId: "asset_1",
        decision: "approve",
        roleSnapshot: "reviewer",
        reason: "ok",
        source: "web",
        requestId: "req_x",
        effectStatus: "none",
        projectId: "proj_a",
        decidedAt: new Date(),
      },
      subjectType: "asset",
      subjectId: "asset_1",
      projectId: "proj_b",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/项目/)
  })

  it("角色错配 → 拒绝", () => {
    const result = assertValidApprovalForHighRisk({
      action: "publish",
      approval: {
        id: "apd_role",
        subjectType: "methodology",
        subjectId: "m1",
        decision: "approve",
        roleSnapshot: "reviewer",
        reason: "ok",
        source: "api",
        requestId: "req_role",
        effectStatus: "none",
        decidedAt: new Date(),
      },
      subjectType: "methodology",
      subjectId: "m1",
      expectedRoles: ["business_owner", "system_owner"],
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
        effectStatus: "none",
        decidedAt: new Date(),
      },
      subjectType: "work_item",
      subjectId: "rec_1",
    })
    expect(result).toEqual({ ok: true, approvalId: "apd_1" })
  })
})

describe("approval requestId idempotency & concurrency", () => {
  it("同 requestId 不重复创建", async () => {
    const store = memoryStore()
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
    expect(store.rows.size).toBe(1)
  })

  it("并发唯一冲突按幂等回收", async () => {
    const store = memoryStore()
    const input = {
      subjectType: "work_item" as const,
      subjectId: "rec_1",
      decision: "approve" as const,
      roleSnapshot: "reviewer",
      reason: "ok",
      source: "feishu_card" as const,
      requestId: "feishu:race:approve",
      externalReviewerId: "ou_reviewer",
    }
    // 预置同 requestId，模拟并发插入冲突
    await store.create({
      ...input,
      id: "apd_first",
      effectStatus: "none",
    })
    const raced = await recordApprovalDecision(store, input, () => "apd_second")
    expect(raced.idempotent).toBe(true)
    expect(raced.record.id).toBe("apd_first")
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

describe("approval-completion 可恢复状态机", () => {
  it("完成失败可重试，重放不重复完成", async () => {
    const approvalStore = memoryStore()
    let completeCalls = 0
    const workItemStore: WorkItemRecordStore = {
      get: async () => ({ recordId: "rec_1", fields: { 状态: "待人工审核", AIM结果ID: "gen_1" } }),
      update: async () => {
        completeCalls += 1
        if (completeCalls === 1) throw new Error("飞书暂时不可用")
        return { ok: true as const }
      },
    }

    // mock completeWorkItem path via work-item-execution is used internally —
    // use real module but store.update fails first then succeeds.
    // Actually processFeishuCardApproval calls completeWorkItem which uses transition.
    // Simpler: spy by controlling store.get/update with proper fields.

    const { completeWorkItem, startWorkItem } = await import("@/lib/aim/services/work-item-execution")
    void completeWorkItem
    void startWorkItem

    const baseInput = {
      assignments: READY,
      workflowId: "content-growth-v1",
      recordId: "rec_1",
      action: "approve" as const,
      openId: "ou_reviewer",
      userId: "",
      messageId: "msg_retry",
      aimResultId: "gen_1",
      workItemStore,
      approvalStore,
      idFactory: () => "apd_retry",
    }

    // First attempt: make completeWorkItem fail by returning invalid status transition
    // Use a store that fails on update
    const first = await processFeishuCardApproval(baseInput)
    expect(first.ok).toBe(false)
    if (!first.ok) {
      expect(first.recoverable).toBe(true)
      expect(first.approval?.effectStatus).toBe("failed")
    }

    // Second attempt (replay): should retry and succeed
    const goodStore: WorkItemRecordStore = {
      get: async () => ({
        recordId: "rec_1",
        fields: {
          状态: "待人工审核",
          AIM结果ID: "gen_1",
          结果摘要: "",
        },
      }),
      update: async () => ({ ok: true as const }),
    }
    const second = await processFeishuCardApproval({
      ...baseInput,
      workItemStore: goodStore,
    })
    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.approval.effectStatus).toBe("applied")
      expect(second.approval.id).toBe("apd_retry")
    }

    // Third replay: already applied → idempotent, no further side effect needed
    let updateCalls = 0
    const probeStore: WorkItemRecordStore = {
      get: async () => ({
        recordId: "rec_1",
        fields: { 状态: "已完成", AIM结果ID: "gen_1", 结果摘要: "飞书卡片审核通过；approvalId=apd_retry" },
      }),
      update: async () => {
        updateCalls += 1
        return { ok: true as const }
      },
    }
    const third = await processFeishuCardApproval({
      ...baseInput,
      workItemStore: probeStore,
    })
    expect(third.ok).toBe(true)
    if (third.ok) {
      expect(third.idempotent).toBe(true)
      expect(updateCalls).toBe(0)
    }
  })

  it("resolveIdempotentApproval 保留已有记录", () => {
    const existing: ApprovalDecisionRecord = {
      id: "apd_x",
      subjectType: "work_item",
      subjectId: "rec_1",
      decision: "approve",
      roleSnapshot: "reviewer",
      reason: "ok",
      source: "feishu_card",
      requestId: "r1",
      effectStatus: "applied",
    }
    const resolved = resolveIdempotentApproval(existing, {
      ...existing,
      id: "apd_new",
      effectStatus: "none",
    })
    expect(resolved.idempotent).toBe(true)
    expect(resolved.record.id).toBe("apd_x")
  })
})

describe("approval-completion 反例：越权回调", () => {
  it("陌生人 open_id 拒绝签字", async () => {
    const approvalStore = memoryStore()
    const workItemStore: WorkItemRecordStore = {
      get: async () => ({ recordId: "rec_1", fields: {} }),
      update: async () => ({ ok: true as const }),
    }
    const result = await processFeishuCardApproval({
      assignments: READY,
      workflowId: "content-growth-v1",
      recordId: "rec_1",
      action: "approve",
      openId: "ou_attacker",
      userId: "",
      messageId: "msg_bad",
      aimResultId: "gen_1",
      workItemStore,
      approvalStore,
    })
    expect(result.ok).toBe(false)
    expect(approvalStore.rows.size).toBe(0)
  })
})

// silence unused vi import if any
void vi
