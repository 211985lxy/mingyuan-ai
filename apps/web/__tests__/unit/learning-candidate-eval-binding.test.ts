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

const METRICS = {
  targetFailureRateBefore: 0.5,
  targetFailureRateAfter: 0.3,
  acceptanceRateBefore: 0.8,
  acceptanceRateAfter: 0.8,
  evidenceCompletenessRateBefore: 0.9,
  evidenceCompletenessRateAfter: 0.9,
  severeHallucinationRate: 0,
}

const DAILY_ARTIFACT = {
  mode: "daily",
  generatedAt: "2026-07-01T00:00:00.000Z",
  contractPassRate: 1,
  rubricPassRate: 0.9,
  results: [{
    fixtureId: "fixture_1",
    contractPassed: true,
    rubricPassed: true,
  }],
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
      fixtureKey: "fixture_1",
      payload: FIXTURE,
    })
    await expect(qualifyEvalFixtureVersion({
      versionId: "version_b",
      candidateId: "candidate_a",
      dailyEvalArtifact: DAILY_ARTIFACT,
      evidenceRef: "report://1",
      metrics: METRICS,
    })).rejects.toThrow(/不属于该学习候选/)
    expect(runEvalCase).not.toHaveBeenCalled()
  })

  it("qualify_eval 不得信任 dailyPassed boolean，缺少制品则 fail-closed", async () => {
    prisma.evalFixtureVersion.findUnique.mockResolvedValue({
      id: "version_a",
      sourceCandidateId: "candidate_a",
      status: "draft",
      fixtureKey: "fixture_1",
      payload: FIXTURE,
    })
    await expect(qualifyEvalFixtureVersion({
      versionId: "version_a",
      candidateId: "candidate_a",
      dailyEvalArtifact: true,
      evidenceRef: "report://1",
      metrics: METRICS,
    })).rejects.toThrow(/daily Eval/)
    expect(runEvalCase).not.toHaveBeenCalled()
    expect(prisma.evalFixtureVersion.update).not.toHaveBeenCalled()
  })

  it("qualify_eval 用制品 generatedAt 写入 dailyPassedAt", async () => {
    prisma.evalFixtureVersion.findUnique.mockResolvedValue({
      id: "version_a",
      sourceCandidateId: "candidate_a",
      status: "draft",
      fixtureKey: "fixture_1",
      payload: FIXTURE,
    })
    runEvalCase.mockResolvedValue({ contractPassed: true })
    prisma.evalFixtureVersion.update.mockResolvedValue({ id: "version_a" })
    await qualifyEvalFixtureVersion({
      versionId: "version_a",
      candidateId: "candidate_a",
      dailyEvalArtifact: DAILY_ARTIFACT,
      evidenceRef: "report://1",
      metrics: METRICS,
    })
    expect(prisma.evalFixtureVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dailyPassedAt: new Date(DAILY_ARTIFACT.generatedAt),
        }),
      }),
    )
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
