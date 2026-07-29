import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  signDailyEvalArtifact,
  type DailyEvalArtifactBody,
} from "@/lib/aim/daily-eval-artifact"

const SECRET = "aim-daily-eval-artifact-secret-test-0001"

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

function artifactBody(
  overrides: Partial<DailyEvalArtifactBody> = {},
): DailyEvalArtifactBody {
  return {
    schemaVersion: 1,
    mode: "daily",
    generatedAt: "2026-07-28T12:00:00.000Z",
    contractPassRate: 1,
    rubricPassRate: 0.9,
    repetitions: 1,
    results: [{
      fixtureId: "fixture_1",
      contractPassed: true,
      rubricScore: 88,
      fabricatedFact: false,
    }],
    qualificationMetrics: METRICS,
    evidenceRef: "report://daily/1",
    ...overrides,
  }
}

describe("eval fixture candidate binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AIM_DAILY_EVAL_ARTIFACT_SECRET = SECRET
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-29T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.AIM_DAILY_EVAL_ARTIFACT_SECRET
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
      dailyEvalArtifact: signDailyEvalArtifact({
        body: artifactBody(),
        secret: SECRET,
      }),
    })).rejects.toThrow(/不属于该学习候选/)
    expect(runEvalCase).not.toHaveBeenCalled()
  })

  it("qualify_eval 拒绝伪造结构化 JSON / 未签名制品", async () => {
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
      dailyEvalArtifact: artifactBody(),
    })).rejects.toThrow(/签名/)
    expect(runEvalCase).not.toHaveBeenCalled()
    expect(prisma.evalFixtureVersion.update).not.toHaveBeenCalled()
  })

  it("qualify_eval 只信任签名制品内的 metrics/evidenceRef", async () => {
    prisma.evalFixtureVersion.findUnique.mockResolvedValue({
      id: "version_a",
      sourceCandidateId: "candidate_a",
      status: "draft",
      fixtureKey: "fixture_1",
      payload: FIXTURE,
    })
    runEvalCase.mockResolvedValue({ contractPassed: true })
    prisma.evalFixtureVersion.update.mockResolvedValue({ id: "version_a" })
    const artifact = signDailyEvalArtifact({
      body: artifactBody(),
      secret: SECRET,
    })
    await qualifyEvalFixtureVersion({
      versionId: "version_a",
      candidateId: "candidate_a",
      dailyEvalArtifact: artifact,
    })
    expect(prisma.evalFixtureVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dailyPassedAt: new Date(artifact.generatedAt),
          qualificationEvidenceRef: "report://daily/1",
          qualificationMetrics: expect.objectContaining({
            targetFailureRateAfter: 0.3,
          }),
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
