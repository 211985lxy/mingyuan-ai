import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  authErrorResponse,
  approveAimMemoryCandidate,
  rejectAimMemoryCandidate,
  validateHighRiskApproval,
  updateMethodologyProfileMeta,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user_1" })),
  authErrorResponse: vi.fn(() => null),
  approveAimMemoryCandidate: vi.fn(),
  rejectAimMemoryCandidate: vi.fn(),
  validateHighRiskApproval: vi.fn(),
  updateMethodologyProfileMeta: vi.fn(),
  recordAdminAudit: vi.fn(async () => "audit_1"),
  prisma: {
    aimMemory: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim-memory", () => ({
  approveAimMemoryCandidate,
  rejectAimMemoryCandidate,
}))
vi.mock("@/lib/aim/approval-validation", () => ({ validateHighRiskApproval }))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/methodology-profile-admin", () => ({
  createMethodologyProfileVersion: vi.fn(),
  getMethodologyProfileAdminDetail: vi.fn(),
  publishMethodologyProfileVersion: vi.fn(),
  updateMethodologyProfileMeta,
}))

import { PATCH as patchMemory } from "@/app/api/aim/memories/[id]/route"
import { PATCH as patchMethodology } from "@/app/api/admin/methodology-profiles/[id]/route"

beforeEach(() => {
  vi.clearAllMocks()
  prisma.aimMemory.findFirst.mockResolvedValue({ projectId: "proj_1" })
  validateHighRiskApproval.mockResolvedValue({ ok: true, approvalId: "apd_1" })
  approveAimMemoryCandidate.mockResolvedValue(true)
  updateMethodologyProfileMeta.mockResolvedValue({ id: "method_1", status: "active" })
})

describe("memory promotion approval scope", () => {
  it("批准记忆时把真实 project scope 交给门禁", async () => {
    const response = await patchMemory(
      new NextRequest("http://localhost/api/aim/memories/mem_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          workflowId: "content-growth-v1",
          approvalId: "apd_1",
        }),
      }),
      { params: Promise.resolve({ id: "mem_1" }) },
    )
    expect(response.status).toBe(200)
    expect(validateHighRiskApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "memory",
        subjectId: "mem_1",
        workflowId: "content-growth-v1",
        projectId: "proj_1",
      }),
    )
  })

  it("unknown/cross-project 门禁失败时不晋升", async () => {
    validateHighRiskApproval.mockResolvedValueOnce({
      ok: false,
      error: "approvalId 与项目不匹配",
    })
    const response = await patchMemory(
      new NextRequest("http://localhost/api/aim/memories/mem_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          workflowId: "content-growth-v1",
          approvalId: "apd_wrong",
        }),
      }),
      { params: Promise.resolve({ id: "mem_1" }) },
    )
    expect(response.status).toBe(403)
    expect(approveAimMemoryCandidate).not.toHaveBeenCalled()
  })
})

describe("methodology metadata approval", () => {
  it("PATCH 元信息也要求双签门禁并写审计", async () => {
    const response = await patchMethodology(
      new NextRequest("http://localhost/api/admin/methodology-profiles/method_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "新版方法论",
          workflowId: "content-growth-v1",
          approvalId: "apd_1",
        }),
      }),
      {
        admin: { id: "admin_1", role: "admin" },
        params: { id: "method_1" },
      } as never,
    )
    expect(response.status).toBe(200)
    expect(validateHighRiskApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "publish",
        subjectType: "methodology",
        subjectId: "method_1",
        workflowId: "content-growth-v1",
        projectId: null,
        dualSign: true,
      }),
    )
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "methodology_profile.update" }),
    )
  })

  it("无有效双签时不更新正式元信息", async () => {
    validateHighRiskApproval.mockResolvedValueOnce({
      ok: false,
      error: "双签不足",
    })
    const response = await patchMethodology(
      new NextRequest("http://localhost/api/admin/methodology-profiles/method_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "越权修改",
          workflowId: "content-growth-v1",
        }),
      }),
      {
        admin: { id: "admin_1", role: "admin" },
        params: { id: "method_1" },
      } as never,
    )
    expect(response.status).toBe(403)
    expect(updateMethodologyProfileMeta).not.toHaveBeenCalled()
  })
})
