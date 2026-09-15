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

  it("asks content_review to inspect provided copy, not write a first draft", () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cr_new_01")!

    expect(fixture.input.rawInput).toContain("质检")
    expect(fixture.input.rawInput).toContain("稿件")
    expect(fixture.input.rawInput).not.toContain("完成一份可直接使用的初稿")
  })
})
