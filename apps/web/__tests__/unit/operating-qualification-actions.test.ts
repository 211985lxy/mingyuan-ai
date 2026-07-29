import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
  prisma: {
    adminAuditLog: { findMany: vi.fn() },
    assetCandidate: { findMany: vi.fn() },
    aimMemory: { findMany: vi.fn() },
    evalFixtureVersion: { findMany: vi.fn() },
    methodologyProfileVersion: { findMany: vi.fn() },
    approvalDecision: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))

import { loadGovernedActions } from "@/lib/aim/operating-qualification-actions"
import type { QualificationWeek } from "@/lib/aim/operating-qualification"

const START = new Date("2026-06-01T00:00:00.000Z")
const END = new Date("2026-06-08T00:00:00.000Z")
const week: QualificationWeek = {
  id: "cycle_1",
  status: "signed",
  periodStart: START,
  periodEnd: END,
  signedAt: END,
  signedApprovalId: "approval_cycle",
  runIdCoverage: 1,
  costCoverage: 1,
  finalDispositionCoverage: 1,
  generationLinkCoverage: 1,
  day7BackfillRate: 1,
}

function approvals(systemReviewer = "system_1") {
  return [
    {
      id: "approval_cycle",
      subjectType: "review_cycle",
      subjectId: "cycle_1",
      decision: "approve",
      roleSnapshot: "system_owner",
      workflowId: "content-growth-v1",
      reviewerUserId: "system_1",
      externalReviewerId: null,
      externalReviewerUserId: null,
      decidedAt: new Date("2026-06-07T00:00:00.000Z"),
    },
    {
      id: "approval_business",
      subjectType: "methodology",
      subjectId: "methodology_version_1",
      decision: "approve",
      roleSnapshot: "business_owner",
      workflowId: "content-growth-v1",
      reviewerUserId: "business_1",
      externalReviewerId: null,
      externalReviewerUserId: null,
      decidedAt: new Date("2026-06-05T00:00:00.000Z"),
    },
    {
      id: "approval_system",
      subjectType: "methodology",
      subjectId: "methodology_version_1",
      decision: "approve",
      roleSnapshot: "system_owner",
      workflowId: "content-growth-v1",
      reviewerUserId: systemReviewer,
      externalReviewerId: null,
      externalReviewerUserId: null,
      decidedAt: new Date("2026-06-05T00:00:00.000Z"),
    },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.adminAuditLog.findMany.mockResolvedValue([{
    id: "audit_methodology",
    action: "methodology_profile_version.publish",
    targetId: "methodology_version_1",
    metadata: {
      approvalId: "approval_business",
      workflowId: "content-growth-v1",
    },
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
  }])
  prisma.assetCandidate.findMany.mockResolvedValue([])
  prisma.aimMemory.findMany.mockResolvedValue([])
  prisma.evalFixtureVersion.findMany.mockResolvedValue([])
  prisma.methodologyProfileVersion.findMany.mockResolvedValue([{
    id: "methodology_version_1",
    publishedAt: new Date("2026-06-06T00:00:00.000Z"),
  }])
  prisma.approvalDecision.findMany.mockResolvedValue(approvals())
})

describe("qualification governed actions", () => {
  it("方法论发布必须有不同人员的业务 Owner 与系统 Owner 双签", async () => {
    const result = await loadGovernedActions([week])
    expect(result.formalWrites).toEqual([
      expect.objectContaining({
        id: "methodology_version_1",
        approvalBacked: true,
      }),
    ])
  })

  it("同一人双角色签字不能通过", async () => {
    prisma.approvalDecision.findMany.mockResolvedValue(
      approvals("business_1"),
    )
    const result = await loadGovernedActions([week])
    expect(result.formalWrites[0]?.approvalBacked).toBe(false)
  })

  it("正式资产晋升按 promotedAt 周窗口计入，不用 later updatedAt", async () => {
    prisma.adminAuditLog.findMany.mockResolvedValueOnce([])
    prisma.methodologyProfileVersion.findMany.mockResolvedValueOnce([])
    prisma.assetCandidate.findMany.mockResolvedValueOnce([
      { id: "asset_in_window", promotedAt: new Date("2026-06-03T00:00:00.000Z") },
    ])
    prisma.approvalDecision.findMany.mockResolvedValueOnce([
      approvals()[0],
      {
        id: "approval_asset",
        subjectType: "asset",
        subjectId: "asset_in_window",
        decision: "approve",
        roleSnapshot: "reviewer",
        workflowId: "content-growth-v1",
        reviewerUserId: "reviewer_1",
        externalReviewerId: null,
        externalReviewerUserId: null,
        decidedAt: new Date("2026-06-02T00:00:00.000Z"),
      },
    ])
    const result = await loadGovernedActions([week])
    expect(prisma.assetCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          promotedAt: { gte: START, lt: END },
        }),
        select: { id: true, promotedAt: true },
      }),
    )
    expect(result.formalWrites).toContainEqual(
      expect.objectContaining({
        id: "asset_in_window",
        type: "formal_asset.promote",
        occurredAt: new Date("2026-06-03T00:00:00.000Z"),
        approvalBacked: true,
      }),
    )
  })

  it("学习候选拒绝接受可追溯 reject 签字", async () => {
    prisma.adminAuditLog.findMany.mockResolvedValueOnce([{
      id: "audit_reject",
      action: "learning_candidate.reject",
      targetId: "candidate_1",
      metadata: { approvalId: "approval_reject" },
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
    }])
    prisma.methodologyProfileVersion.findMany.mockResolvedValueOnce([])
    prisma.approvalDecision.findMany.mockResolvedValueOnce([
      approvals()[0],
      {
        id: "approval_reject",
        subjectType: "learning_candidate",
        subjectId: "candidate_1",
        decision: "reject",
        roleSnapshot: "reviewer",
        workflowId: "content-growth-v1",
        reviewerUserId: "reviewer_1",
        externalReviewerId: null,
        externalReviewerUserId: null,
        decidedAt: new Date("2026-06-05T00:00:00.000Z"),
      },
    ])
    const result = await loadGovernedActions([week])
    expect(result.highRiskActions).toContainEqual(
      expect.objectContaining({ id: "audit_reject", approvalBacked: true }),
    )
  })
})
