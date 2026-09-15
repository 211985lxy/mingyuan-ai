import { describe, expect, it } from "vitest"

import { ALL_FIXTURES } from "./fixtures"
import { sampleFixtures } from "@/lib/aim-harness/eval-runner"

describe("daily real-model sample", () => {
  it("always includes every P0 contract regression fixture", () => {
    const regressions = ALL_FIXTURES.filter((fixture) => fixture.contractRegressionOnly)
    const sampledIds = sampleFixtures(ALL_FIXTURES, 15).map((fixture) => fixture.id)

    expect(regressions.length).toBeGreaterThan(0)
    expect(sampledIds).toEqual(expect.arrayContaining(regressions.map((fixture) => fixture.id)))
  })
})
