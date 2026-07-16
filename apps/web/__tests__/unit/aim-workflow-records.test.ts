import { describe, expect, it } from "vitest"

import { parseAimOutcomeNumber } from "@/hooks/use-aim-workflow-records"

describe("AIM workflow record metrics", () => {
  it("keeps missing and invalid metrics distinct from zero", () => {
    expect(parseAimOutcomeNumber({}, "views")).toBeNull()
    expect(parseAimOutcomeNumber({ views: "not-a-number" }, "views")).toBeNull()
    expect(parseAimOutcomeNumber({ views: "0" }, "views")).toBe(0)
    expect(parseAimOutcomeNumber({ revenue: " 1280.5 " }, "revenue")).toBe(1280.5)
  })
})
