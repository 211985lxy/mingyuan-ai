import { afterEach, describe, expect, it } from "vitest"
import {
  signDailyEvalArtifact,
  verifyDailyEvalArtifact,
  type DailyEvalArtifactBody,
} from "@/lib/aim/daily-eval-artifact"

const SECRET = "aim-daily-eval-artifact-secret-test-0001"
const OTHER_SECRET = "aim-daily-eval-artifact-secret-test-0002"
const GENERATED_AT = "2026-07-28T12:00:00.000Z"
const NOW = new Date("2026-07-29T00:00:00.000Z")

const METRICS = {
  targetFailureRateBefore: 0.5,
  targetFailureRateAfter: 0.3,
  acceptanceRateBefore: 0.8,
  acceptanceRateAfter: 0.8,
  evidenceCompletenessRateBefore: 0.9,
  evidenceCompletenessRateAfter: 0.9,
  severeHallucinationRate: 0,
}

function body(overrides: Partial<DailyEvalArtifactBody> = {}): DailyEvalArtifactBody {
  return {
    schemaVersion: 1,
    mode: "daily",
    generatedAt: GENERATED_AT,
    contractPassRate: 1,
    rubricPassRate: 0.85,
    repetitions: 1,
    results: [{
      fixtureId: "fixture_1",
      contractPassed: true,
      rubricScore: 82,
      fabricatedFact: false,
    }],
    qualificationMetrics: METRICS,
    evidenceRef: "report://daily/1",
    ...overrides,
  }
}

function signed(overrides: Partial<DailyEvalArtifactBody> = {}, secret = SECRET) {
  return signDailyEvalArtifact({ body: body(overrides), secret })
}

afterEach(() => {
  delete process.env.AIM_DAILY_EVAL_ARTIFACT_SECRET
})

describe("verifyDailyEvalArtifact HMAC", () => {
  it("合法签名制品通过，并从制品读取 metrics/evidenceRef", () => {
    const artifact = signed()
    const result = verifyDailyEvalArtifact({
      artifact,
      secret: SECRET,
      now: NOW,
    })
    expect(result).toEqual({
      ok: true,
      passedAt: new Date(GENERATED_AT),
      metrics: METRICS,
      evidenceRef: "report://daily/1",
    })
  })

  it("未配置 secret / 无签名 / 错签名均 fail-closed", () => {
    const artifact = signed()
    expect(verifyDailyEvalArtifact({
      artifact,
      secret: undefined,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/未配置/) })

    const { signature: _ignored, ...unsigned } = artifact
    expect(verifyDailyEvalArtifact({
      artifact: unsigned,
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/签名/) })

    expect(verifyDailyEvalArtifact({
      artifact: { ...artifact, signature: "0".repeat(64) },
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/签名/) })

    expect(verifyDailyEvalArtifact({
      artifact,
      secret: OTHER_SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/签名/) })
  })

  it("伪造结构化 JSON（无服务端签名）不得通过", () => {
    expect(verifyDailyEvalArtifact({
      artifact: body(),
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/签名/) })
  })

  it("篡改 qualificationMetrics 或 evidenceRef 后签名失效", () => {
    const artifact = signed()
    const tamperedMetrics = {
      ...artifact,
      qualificationMetrics: {
        ...METRICS,
        targetFailureRateAfter: 0.01,
      },
    }
    expect(verifyDailyEvalArtifact({
      artifact: tamperedMetrics,
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/签名/) })

    const tamperedEvidence = {
      ...artifact,
      evidenceRef: "report://forged",
    }
    expect(verifyDailyEvalArtifact({
      artifact: tamperedEvidence,
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/签名/) })
  })

  it("过期与未来制品拒绝", () => {
    const expired = signed({ generatedAt: "2026-07-01T00:00:00.000Z" })
    expect(verifyDailyEvalArtifact({
      artifact: expired,
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/过期/) })

    const future = signed({ generatedAt: "2026-07-30T00:00:00.000Z" })
    expect(verifyDailyEvalArtifact({
      artifact: future,
      secret: SECRET,
      now: NOW,
    })).toMatchObject({ ok: false, reason: expect.stringMatching(/未来/) })
  })

  it("signDailyEvalArtifact 拒绝过短 secret，且不读取用户 API key", () => {
    process.env.DAILY_EVAL_API_KEY = "user-visible-api-key-should-not-be-used"
    expect(() => signDailyEvalArtifact({
      body: body(),
      secret: "too-short",
    })).toThrow(/AIM_DAILY_EVAL_ARTIFACT_SECRET/)
    delete process.env.DAILY_EVAL_API_KEY
  })
})
