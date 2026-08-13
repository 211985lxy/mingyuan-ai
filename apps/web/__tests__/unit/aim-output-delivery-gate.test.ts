import { describe, expect, it } from "vitest"

import {
  inspectAimDeliveryCandidate,
  parseStrictMultiFormatResponse,
} from "@/lib/aim/output-delivery-gate"

describe("AIM delivery gate", () => {
  it("rejects a single-format response without a final marker", () => {
    expect(parseStrictMultiFormatResponse("我先复述一下任务……", ["video_script"]))
      .toEqual(expect.objectContaining({ ok: false, code: "missing_final_marker" }))
  })

  it("rejects internal deliberation even when wrapped in a format marker", () => {
    const parsed = parseStrictMultiFormatResponse(
      "===FORMAT:video_script===\n好的老板，我先在内部复述一遍。\n最终决定：只改开头。",
      ["video_script"],
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(inspectAimDeliveryCandidate({ contents: parsed.contents, finishReason: "stop" }))
      .toEqual(expect.objectContaining({ passed: false, code: "internal_meta_leak" }))
  })

  it("does not reject natural first-person spoken copy", () => {
    const parsed = parseStrictMultiFormatResponse(
      "===FORMAT:video_script===\n我做供暖二十年，最怕的不是设备贵，是账算不清。",
      ["video_script"],
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(inspectAimDeliveryCandidate({ contents: parsed.contents, finishReason: "stop" }).passed).toBe(true)
  })

  it("rejects truncated output", () => {
    expect(inspectAimDeliveryCandidate({
      contents: { video_script: "未完成的正文" },
      finishReason: "length",
    })).toEqual(expect.objectContaining({ passed: false, code: "truncated" }))
  })
})
