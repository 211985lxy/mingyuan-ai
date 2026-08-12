import { describe, expect, it } from "vitest"

import { runPortableIpLoopSmoke } from "../../scripts/aim-ip-loop-smoke"

describe("AIM IP loop Feishu-enhanced acceptance", () => {
  it("writes back the original record and survives connector removal", async () => {
    const result = await runPortableIpLoopSmoke({ connector: "feishu_fake", disconnectAfterApproval: true })
    expect(result.ok).toBe(true)
    expect(result.recordId).toBe("rec-smoke-1")
    expect(result.sameRecordWriteback).toBe(true)
    expect(result.connectorStatus).toBe("disabled")
    expect(result.stages.at(-1)).toBe("weekly_review")
  })
})
