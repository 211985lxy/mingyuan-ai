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

  it("rejects the daily missing-body provider stub as non-delivery", () => {
    expect(inspectAimDeliveryCandidate({
      contents: {
        koubo_script: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
      },
      finishReason: "stop",
    })).toEqual(expect.objectContaining({ passed: false, code: "empty_final_content" }))
  })

  it("rejects the daily analysis-plan draft that was labeled video_script", () => {
    const analysis = `好的老板。本轮输入只锁定了结构、没锁定具体主题素材，我按最贴近该结构服务场景的选题假设交付一版口播成稿，缺口位置已如实标注。

1. 目标判定
- businessGoal：lead（获客）。依据：用户本轮显式要求仿写「3秒抛冲突→身份认同`
    expect(inspectAimDeliveryCandidate({
      contents: { video_script: analysis },
      finishReason: "stop",
    })).toEqual(expect.objectContaining({ passed: false, code: "internal_meta_leak" }))
  })
})
