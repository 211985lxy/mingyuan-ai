import { describe, expect, it } from "vitest"

import {
  evaluateHitlGate,
  HITL_HIGH_RISK_TOOL_ACTIONS,
  hitlRequestId,
  isHitlInlineEnabled,
  settleHitlApproval,
} from "@/lib/aim/hitl-gate"
import type { ApprovalDecisionStorePort } from "@/lib/aim/approval-decision-store"
import type { ApprovalDecisionRecord } from "@/lib/aim/workflow-governance"

/**
 * Step③ HITL 门闩链路测试（模拟全链路，不连真实 DB）：
 * 关闭 → 放行；开启 → 挂起等审批；批准 → 幂等放行；驳回 → 保持拦截。
 */

process.env.AIM_HITL_INLINE_ENABLED = "false"

function makeStore(): ApprovalDecisionStorePort & { records: Map<string, ApprovalDecisionRecord> } {
  const records = new Map<string, ApprovalDecisionRecord>()
  let seq = 0
  return {
    records,
    async findByRequestId(requestId) {
      return records.get(requestId) ?? null
    },
    async findById(id) {
      return [...records.values()].find((r) => r.id === id) ?? null
    },
    async findBySubject() {
      return [...records.values()]
    },
    async create(input) {
      const record = { ...input, id: input.id || `apd_${++seq}`, decidedAt: new Date() } as ApprovalDecisionRecord
      records.set(record.requestId, record)
      return record
    },
    async updateEffect(id, patch) {
      const record = [...records.values()].find((r) => r.id === id)!
      Object.assign(record, patch)
      return record
    },
    async claimEffect(id, claimToken) {
      const record = [...records.values()].find((r) => r.id === id)!
      Object.assign(record, { effectClaimToken: claimToken, effectStatus: "claimed" })
      return { claimed: true, record }
    },
    async settleEffect(id, _claimToken, patch) {
      const record = [...records.values()].find((r) => r.id === id)!
      Object.assign(record, patch)
      return record
    },
  }
}

const BASE = { userId: "u1", projectId: "p1", toolAction: "export_lark_generation", resultId: "gen-1" }

describe("HITL 门闩（Step③）", () => {
  it("默认关闭：高风险动作也不拦截", async () => {
    expect(isHitlInlineEnabled()).toBe(false)
    const decision = await evaluateHitlGate(BASE, makeStore())
    expect(decision).toEqual({ gated: false })
  })

  it("开启后：未审批的高风险动作被挂起，普通动作不受影响", async () => {
    process.env.AIM_HITL_INLINE_ENABLED = "true"
    try {
      const store = makeStore()
      const decision = await evaluateHitlGate(BASE, store)
      expect(decision.gated).toBe(true)
      if (decision.gated) {
        expect(decision.approval.status).toBe("pending")
        expect(decision.approval.risk).toBe("external_send")
        expect(decision.approval.approvalRequestId).toBe(hitlRequestId(BASE))
      }
      // 非高风险动作（导入不在清单里的动作）不拦截
      const lowRisk = await evaluateHitlGate({ ...BASE, toolAction: "unknown_action" }, store)
      expect(lowRisk).toEqual({ gated: false })
    } finally {
      process.env.AIM_HITL_INLINE_ENABLED = "false"
    }
  })

  it("模拟链路：挂起 → 批准 → 幂等放行；驳回 → 保持拦截", async () => {
    process.env.AIM_HITL_INLINE_ENABLED = "true"
    try {
      const store = makeStore()

      // 1. 挂起
      const first = await evaluateHitlGate(BASE, store)
      expect(first.gated).toBe(true)

      // 2. 驳回 → 仍拦截，状态 rejected
      await settleHitlApproval({ ...BASE, decision: "reject" }, store)
      const afterReject = await evaluateHitlGate(BASE, store)
      expect(afterReject.gated).toBe(true)
      if (afterReject.gated) expect(afterReject.approval.status).toBe("rejected")

      // 3. 改主意批准（幂等键同 requestId，同 subject 同 reviewer）→ 放行
      const settle = await settleHitlApproval({ ...BASE, decision: "approve" }, store)
      expect(settle.proceed).toBe(true)
      const afterApprove = await evaluateHitlGate(BASE, store)
      expect(afterApprove).toEqual({ gated: false })

      // 4. 审批记录落库且决策为 approve
      const record = store.records.get(hitlRequestId({ ...BASE, decision: "approve" }))
      expect(record?.decision).toBe("approve")
      expect(record?.subjectType).toBe("generation")
      expect(record?.subjectId).toBe("gen-1")
    } finally {
      process.env.AIM_HITL_INLINE_ENABLED = "false"
    }
  })

  it("无 resultId 的动作走 workflow_change subject", async () => {
    process.env.AIM_HITL_INLINE_ENABLED = "true"
    try {
      const store = makeStore()
      const input = { userId: "u1", projectId: "p1", toolAction: "import_lark_topics" }
      const settle = await settleHitlApproval({ ...input, decision: "approve" }, store)
      expect(settle.record.subjectType).toBe("workflow_change")
      expect(settle.record.subjectId).toBe("chat:u1:import_lark_topics")
    } finally {
      process.env.AIM_HITL_INLINE_ENABLED = "false"
    }
  })

  it("高风险清单覆盖对外发送与写知识库两类", () => {
    const risks = new Set(Object.values(HITL_HIGH_RISK_TOOL_ACTIONS).map((a) => a.risk))
    expect(risks.has("external_send")).toBe(true)
    expect(risks.has("write_knowledge_base")).toBe(true)
  })
})
