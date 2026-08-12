import { describe, expect, it } from "vitest"

import { runPortableIpLoopSmoke } from "../../scripts/aim-ip-loop-smoke"

describe("AIM IP loop web-only acceptance", () => {
  it("completes the core loop with every connector disabled", async () => {
    const result = await runPortableIpLoopSmoke({ connector: "disabled" })
    expect(result.ok).toBe(true)
    expect(result.stages).toEqual(["capture", "direction", "content", "review", "publish", "outcome", "weekly_review"])
    expect(result.connectorStatus).toBe("disabled")
  })
})
