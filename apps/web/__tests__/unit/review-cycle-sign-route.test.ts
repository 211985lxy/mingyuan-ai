import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  validateHighRiskApproval,
  signReviewCycle,
  addReviewAction,
  updateReviewActionStatus,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => ({
  validateHighRiskApproval: vi.fn(),
  signReviewCycle: vi.fn(),
  addReviewAction: vi.fn(),
  updateReviewActionStatus: vi.fn(),
  recordAdminAudit: vi.fn(async () => "audit_1"),
  prisma: {
    reviewCycle: { findUnique: vi.fn() },
    approvalDecision: { findUnique: vi.fn() },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminOrEditor: (handler: any) => handler,
  withAdminOnly: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/aim/approval-validation", () => ({ validateHighRiskApproval }))
vi.mock("@/lib/aim/review-cycle-store", () => ({
  signReviewCycle,
  addReviewAction,
  updateReviewActionStatus,
}))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { PATCH } from "@/app/api/admin/aim/review-cycles/[id]/route"

const context = { admin: { id: "admin_1" }, params: { id: "cycle_1" } }

function patch(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/aim/review-cycles/cycle_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.reviewCycle.findUnique.mockResolvedValue({
    systemOwnerId: "system_owner_1",
    filterSnapshot: { workflowId: "growth", projectId: "project_1" },
  })
  prisma.approvalDecision.findUnique.mockResolvedValue({
    reviewerUserId: "system_owner_1",
    externalReviewerId: null,
    externalReviewerUserId: null,
  })
  validateHighRiskApproval.mockResolvedValue({ ok: true, approvalId: "approval_1" })
  signReviewCycle.mockResolvedValue({
    record: { id: "cycle_1", status: "signed" },
    idempotent: false,
  })
})

describe("review cycle signing route", () => {
  it("只有当前 system owner 的有效 approval 可签字", async () => {
    const response = await PATCH(patch({
      action: "sign",
      approvalId: "approval_1",
      workflowId: "growth",
    }), context as never)
    expect(response.status).toBe(200)
    expect(validateHighRiskApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "review_cycle",
        subjectId: "cycle_1",
        projectId: "project_1",
        expectedRoles: ["system_owner"],
      }),
    )
    expect(signReviewCycle).toHaveBeenCalledWith({
      reviewCycleId: "cycle_1",
      approvalId: "approval_1",
    })
  })

  it("approval 签字人与周期 systemOwnerId 不同则拒绝", async () => {
    prisma.approvalDecision.findUnique.mockResolvedValueOnce({
      reviewerUserId: "other_owner",
      externalReviewerId: null,
      externalReviewerUserId: null,
    })
    const response = await PATCH(patch({
      action: "sign",
      approvalId: "approval_1",
      workflowId: "growth",
    }), context as never)
    expect(response.status).toBe(403)
    expect(signReviewCycle).not.toHaveBeenCalled()
  })

  it("未知动作 fail closed", async () => {
    const response = await PATCH(patch({ action: "delete" }), context as never)
    expect(response.status).toBe(400)
  })
})
