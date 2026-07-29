import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  recordAdminAudit,
  resolveApprovalSubjectScope,
  listActiveGovernanceAssignments,
  recordApprovalDecision,
  prisma,
} = vi.hoisted(() => ({
  recordAdminAudit: vi.fn(async () => "audit_1"),
  resolveApprovalSubjectScope: vi.fn(),
  listActiveGovernanceAssignments: vi.fn(),
  recordApprovalDecision: vi.fn(),
  prisma: {
    approvalDecision: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/aim/approval-validation", () => ({ resolveApprovalSubjectScope }))
vi.mock("@/lib/aim/approval-decision-prisma", () => ({
  createPrismaApprovalDecisionStore: vi.fn(() => ({})),
  listActiveGovernanceAssignments,
}))
vi.mock("@/lib/aim/approval-decision-store", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/aim/approval-decision-store")>()
  return { ...original, recordApprovalDecision }
})
vi.mock("@/lib/prisma", () => ({ prisma }))

import { POST } from "@/app/api/admin/approval-decisions/route"

const assignments = [
  {
    scopeType: "workflow",
    scopeId: "content-growth-v1",
    role: "business_owner",
    userId: "owner_1",
    status: "active",
    effectiveAt: new Date("2026-01-01"),
  },
  {
    scopeType: "workflow",
    scopeId: "content-growth-v1",
    role: "backup_owner",
    userId: "backup_1",
    status: "active",
    effectiveAt: new Date("2026-01-01"),
  },
  {
    scopeType: "workflow",
    scopeId: "content-growth-v1",
    role: "reviewer",
    userId: "admin_1",
    status: "active",
    effectiveAt: new Date("2026-01-01"),
  },
  {
    scopeType: "system",
    scopeId: "global",
    role: "system_owner",
    userId: "system_1",
    status: "active",
    effectiveAt: new Date("2026-01-01"),
  },
]

function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/approval-decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function context(adminId = "admin_1") {
  return { admin: { id: adminId, email: "admin@test.com", role: "admin" } }
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveApprovalSubjectScope.mockResolvedValue({ projectId: "proj_1" })
  listActiveGovernanceAssignments.mockResolvedValue(assignments)
  recordApprovalDecision.mockResolvedValue({
    record: { id: "apd_real", effectStatus: "none" },
    idempotent: false,
  })
})

describe("admin approval-decisions API", () => {
  it("按当前 assignment 身份签字并写审计", async () => {
    const response = await POST(
      post({
        subjectType: "asset",
        subjectId: "asset_1",
        workflowId: "content-growth-v1",
        projectId: "proj_1",
        role: "reviewer",
        decision: "approve",
        reason: "证据完整",
        requestId: "web:req_1",
      }),
      context() as never,
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.item.id).toBe("apd_real")
    expect(recordApprovalDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reviewerUserId: "admin_1",
        projectId: "proj_1",
        workflowId: "content-growth-v1",
        roleSnapshot: "reviewer",
      }),
    )
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approval_decision.sign" }),
    )
  })

  it("未配置为该角色的管理员不能签字", async () => {
    const response = await POST(
      post({
        subjectType: "asset",
        subjectId: "asset_1",
        workflowId: "content-growth-v1",
        role: "reviewer",
        decision: "approve",
        reason: "越权尝试",
        requestId: "web:req_2",
      }),
      context("admin_stranger") as never,
    )
    expect(response.status).toBe(403)
    expect(recordApprovalDecision).not.toHaveBeenCalled()
  })

  it("caller projectId 与真实事项不一致时拒绝", async () => {
    const response = await POST(
      post({
        subjectType: "asset",
        subjectId: "asset_1",
        workflowId: "content-growth-v1",
        projectId: "proj_other",
        role: "reviewer",
        decision: "approve",
        reason: "跨项目尝试",
        requestId: "web:req_3",
      }),
      context() as never,
    )
    expect(response.status).toBe(400)
  })

  it("work_item 不能绕过飞书真实操作人入口签字", async () => {
    const response = await POST(
      post({
        subjectType: "work_item",
        subjectId: "rec_1",
        workflowId: "content-growth-v1",
        role: "reviewer",
        decision: "approve",
        reason: "绕过尝试",
        requestId: "web:req_4",
      }),
      context() as never,
    )
    expect(response.status).toBe(400)
  })
})
