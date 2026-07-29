import { describe, expect, it } from "vitest"
import { verifyDailyEvalArtifact } from "@/lib/aim/daily-eval-artifact"

const GENERATED_AT = "2026-07-20T12:00:00.000Z"
const NOW = new Date("2026-07-29T00:00:00.000Z")

function passingArtifact(overrides: Record<string, unknown> = {}) {
  return {
    mode: "daily",
    generatedAt: GENERATED_AT,
    contractPassRate: 1,
    rubricPassRate: 0.85,
    results: [{
      fixtureId: "fixture_1",
      contractPassed: true,
      rubricPassed: true,
    }],
    ...overrides,
  }
}

describe("verifyDailyEvalArtifact", () => {
  it("接受结构化 daily 制品并用 generatedAt 作为 passedAt", () => {
    const result = verifyDailyEvalArtifact({
      artifact: passingArtifact(),
      fixtureKey: "fixture_1",
      now: NOW,
    })
    expect(result).toEqual({
      ok: true,
      passedAt: new Date(GENERATED_AT),
    })
  })

  it("拒绝 boolean / 空制品（fail-closed）", () => {
    expect(verifyDailyEvalArtifact({
      artifact: true,
      fixtureKey: "fixture_1",
      now: NOW,
    }).ok).toBe(false)
    expect(verifyDailyEvalArtifact({
      artifact: null,
      fixtureKey: "fixture_1",
      now: NOW,
    }).ok).toBe(false)
  })

  it("mode 非 daily、契约未满、未覆盖 fixture、fixture 未通过均拒绝", () => {
    expect(verifyDailyEvalArtifact({
      artifact: passingArtifact({ mode: "weekly" }),
      fixtureKey: "fixture_1",
      now: NOW,
    })).toMatchObject({ ok: false })
    expect(verifyDailyEvalArtifact({
      artifact: passingArtifact({ contractPassRate: 0.99 }),
      fixtureKey: "fixture_1",
      now: NOW,
    })).toMatchObject({ ok: false })
    expect(verifyDailyEvalArtifact({
      artifact: passingArtifact({
        results: [{ fixtureId: "other", contractPassed: true, rubricPassed: true }],
      }),
      fixtureKey: "fixture_1",
      now: NOW,
    })).toMatchObject({ ok: false })
    expect(verifyDailyEvalArtifact({
      artifact: passingArtifact({
        results: [{ fixtureId: "fixture_1", contractPassed: false, rubricPassed: true }],
      }),
      fixtureKey: "fixture_1",
      now: NOW,
    })).toMatchObject({ ok: false })
  })
})
