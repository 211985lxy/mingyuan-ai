import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  validateHighRiskApproval,
  listActiveGovernanceAssignments,
  approvalStillMatchesAssignment,
  assertWorkflowGovernanceReady,
  decideLearningCandidate,
  promoteLearningCandidateToEvalDraft,
  qualifyEvalFixtureVersion,
  activateEvalFixtureVersion,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => ({
  validateHighRiskApproval: vi.fn(),
  listActiveGovernanceAssignments: vi.fn(),
  approvalStillMatchesAssignment: vi.fn(),
  assertWorkflowGovernanceReady: vi.fn(),
  decideLearningCandidate: vi.fn(),
  promoteLearningCandidateToEvalDraft: vi.fn(),
  qualifyEvalFixtureVersion: vi.fn(),
  activateEvalFixtureVersion: vi.fn(),
  recordAdminAudit: vi.fn(async () => "audit_1"),
  prisma: {
    learningCandidate: { findUnique: vi.fn() },
    approvalDecision: { findUnique: vi.fn() },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/aim/approval-validation", () => ({ validateHighRiskApproval }))
vi.mock("@/lib/aim/approval-decision-prisma", () => ({
  listActiveGovernanceAssignments,
}))
vi.mock("@/lib/aim/workflow-governance", () => ({
  APPROVAL_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  approvalStillMatchesAssignment,
  assertWorkflowGovernanceReady,
}))
vi.mock("@/lib/aim/learning-candidate-store", () => ({
  activateEvalFixtureVersion,
  annotateLearningCandidate: vi.fn(),
  decideLearningCandidate,
  markLearningCandidatePromoted: vi.fn(),
  promoteLearningCandidateToEvalDraft,
  qualifyEvalFixtureVersion,
}))
vi.mock("@/lib/methodology-profile-admin", () => ({
  createMethodologyProfileVersion: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { PATCH } from "@/app/api/admin/aim/learning-candidates/[id]/route"

const context = { admin: { id: "admin_1" }, params: { id: "candidate_1" } }

function patch(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost/api/admin/aim/learning-candidates/candidate_1",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.learningCandidate.findUnique.mockResolvedValue({ projectId: "project_1" })
  prisma.approvalDecision.findUnique.mockResolvedValue({
    reviewerUserId: "reviewer_1",
    externalReviewerId: null,
    externalReviewerUserId: null,
  })
  validateHighRiskApproval.mockResolvedValue({ ok: true, approvalId: "approval_1" })
  assertWorkflowGovernanceReady.mockReturnValue({ ok: true, assignments: [] })
  approvalStillMatchesAssignment.mockReturnValue(true)
  listActiveGovernanceAssignments.mockResolvedValue([])
  promoteLearningCandidateToEvalDraft.mockResolvedValue({
    record: { id: "fixture_1" },
    idempotent: false,
  })
})

describe("learning candidate admin route", () => {
  it("未知动作在审批查询前 fail closed", async () => {
    const response = await PATCH(patch({ action: "publish" }), context as never)
    expect(response.status).toBe(400)
    expect(prisma.learningCandidate.findUnique).not.toHaveBeenCalled()
  })

  it("Eval 草稿晋升必须引用有效人工审批", async () => {
    const response = await PATCH(patch({
      action: "promote_eval",
      approvalId: "approval_1",
      workflowId: "growth",
    }), context as never)
    expect(response.status).toBe(200)
    expect(validateHighRiskApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "learning_candidate",
        subjectId: "candidate_1",
        workflowId: "growth",
        projectId: "project_1",
      }),
    )
    expect(promoteLearningCandidateToEvalDraft).toHaveBeenCalledWith({
      candidateId: "candidate_1",
      reviewerId: "reviewer_1",
    })
  })

  it("过期 reject 签字不能拒绝候选", async () => {
    prisma.approvalDecision.findUnique.mockResolvedValueOnce({
      reviewerUserId: "reviewer_1",
      externalReviewerId: null,
      externalReviewerUserId: null,
      decidedAt: new Date("2020-01-01T00:00:00Z"),
      decision: "reject",
      subjectType: "learning_candidate",
      subjectId: "candidate_1",
      workflowId: "growth",
      projectId: "project_1",
      roleSnapshot: "reviewer",
    })
    const response = await PATCH(patch({
      action: "reject",
      approvalId: "approval_old",
      workflowId: "growth",
    }), context as never)
    expect(response.status).toBe(403)
    expect(decideLearningCandidate).not.toHaveBeenCalled()
  })

  it("qualify_eval/activate_eval 必须把 URL candidateId 绑定到 version", async () => {
    qualifyEvalFixtureVersion.mockResolvedValueOnce({ id: "version_1" })
    activateEvalFixtureVersion.mockResolvedValueOnce({
      record: { id: "version_1" },
      idempotent: false,
    })
    const qualify = await PATCH(patch({
      action: "qualify_eval",
      approvalId: "approval_1",
      workflowId: "growth",
      versionId: "version_other",
      dailyPassed: true,
      evidenceRef: "report://1",
      metrics: {
        targetFailureRateBefore: 0.5,
        targetFailureRateAfter: 0.3,
        acceptanceRateBefore: 0.8,
        acceptanceRateAfter: 0.8,
        evidenceCompletenessRateBefore: 0.9,
        evidenceCompletenessRateAfter: 0.9,
        severeHallucinationRate: 0,
      },
    }), context as never)
    expect(qualify.status).toBe(200)
    expect(qualifyEvalFixtureVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: "version_other",
        candidateId: "candidate_1",
      }),
    )

    const activate = await PATCH(patch({
      action: "activate_eval",
      approvalId: "approval_1",
      workflowId: "growth",
      versionId: "version_other",
    }), context as never)
    expect(activate.status).toBe(200)
    expect(activateEvalFixtureVersion).toHaveBeenCalledWith({
      versionId: "version_other",
      candidateId: "candidate_1",
      approvalId: "approval_1",
    })
  })
})
