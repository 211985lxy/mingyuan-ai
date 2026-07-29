import { beforeEach, describe, expect, it, vi } from "vitest"

const { runEvalCase, createFrozenContextAdapter, prisma } = vi.hoisted(() => ({
  runEvalCase: vi.fn(),
  createFrozenContextAdapter: vi.fn(() => ({})),
  prisma: {
    evalFixtureVersion: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalDecision: { findUnique: vi.fn() },
  },
}))

vi.mock("@/lib/aim-harness/eval-runner", () => ({
  runEvalCase,
  createFrozenContextAdapter,
}))
vi.mock("@/lib/prisma", () => ({ prisma }))

import {
  activateEvalFixtureVersion,
  qualifyEvalFixtureVersion,
} from "@/lib/aim/learning-candidate-store"

const FIXTURE = {
  id: "fixture_1",
  version: 1,
  agent: "content_producer",
  scenario: "topic",
  entrypoint: "generate",
  description: "test",
  input: { rawInput: "hello" },
  seedContext: { knowledge: [] },
  expectations: { outputFormats: ["video_script"] },
}

describe("eval fixture candidate binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("qualify_eval 拒绝操作不属于 URL 候选的 version", async () => {
    prisma.evalFixtureVersion.findUnique.mockResolvedValue({
      id: "version_b",
      sourceCandidateId: "candidate_b",
      status: "draft",
      payload: FIXTURE,
    })
    await expect(qualifyEvalFixtureVersion({
      versionId: "version_b",
      candidateId: "candidate_a",
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
    })).rejects.toThrow(/不属于该学习候选/)
    expect(runEvalCase).not.toHaveBeenCalled()
  })

  it("activate_eval 拒绝跨候选激活", async () => {
    prisma.evalFixtureVersion.findUnique.mockResolvedValue({
      id: "version_b",
      sourceCandidateId: "candidate_b",
      status: "qualified",
      deterministicPassedAt: new Date("2026-07-01T00:00:00Z"),
      dailyPassedAt: new Date("2026-07-01T00:00:00Z"),
    })
    prisma.approvalDecision.findUnique.mockResolvedValue({
      decidedAt: new Date("2026-07-02T00:00:00Z"),
    })
    await expect(activateEvalFixtureVersion({
      versionId: "version_b",
      candidateId: "candidate_a",
      approvalId: "approval_1",
    })).rejects.toThrow(/不属于该学习候选/)
    expect(prisma.evalFixtureVersion.updateMany).not.toHaveBeenCalled()
  })
})
