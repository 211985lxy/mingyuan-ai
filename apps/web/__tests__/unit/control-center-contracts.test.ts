import { describe, expect, it } from "vitest"

import { normalizeControlCenterFilters, ratioOrNull } from "@/lib/control-center-contracts"

describe("control center contracts", () => {
  it("trims and bounds optional filters", () => {
    expect(normalizeControlCenterFilters({
      from: "2026-09-01",
      to: "2026-09-07",
      projectId: `  ${"p".repeat(250)}  `,
      agentId: "  agent  ",
      channel: "",
    })).toEqual({
      from: "2026-09-01",
      to: "2026-09-07",
      projectId: "p".repeat(191),
      agentId: "agent",
      channel: undefined,
    })
  })

  it("does not turn unavailable or empty populations into a percentage", () => {
    expect(ratioOrNull(0, 0)).toBeNull()
    expect(ratioOrNull(3, 10)).toBe(0.3)
    expect(ratioOrNull(11, 10)).toBe(1)
  })
})
