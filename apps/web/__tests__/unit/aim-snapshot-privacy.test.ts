import { describe, expect, it } from "vitest"
import { planAimRun } from "@/lib/aim-harness/planner"
import { redactRunSpec } from "@/lib/aim-harness/snapshot"

describe("AIM snapshot privacy", () => {
  it("removes raw customer input from the stored run spec", () => {
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "content_producer",
      rawInput: "客户私密原始资料",
      targetFormats: ["video_script"],
    })

    const stored = redactRunSpec(spec)
    expect(stored.rawInput).toBe("[redacted:8 chars]")
    expect(JSON.stringify(stored)).not.toContain("客户私密原始资料")
  })
})
