import { describe, expect, it } from "vitest"
import { classifyAimFailure, mapAimErrorToUserMessage, mapAimFailureCodeToUserMessage } from "@/lib/aim-error-message"
import { AimDeadlineExceededError } from "@/lib/llm/execution-deadline"
import { AimDeliveryContentError } from "@/lib/aim/delivery-content-gate"

describe("mapAimErrorToUserMessage", () => {
  it("透传含中文的用户可读错误", () => {
    expect(mapAimErrorToUserMessage(new Error("生成结果被截断或正文过短，已停止交付"), "兜底"))
      .toBe("生成结果被截断或正文过短，已停止交付")
    expect(mapAimErrorToUserMessage(new Error("请选择 IP 营销全案"), "兜底"))
      .toBe("请选择 IP 营销全案")
  })

  it("英文/技术错误回落到友好文案（不外泄）", () => {
    expect(mapAimErrorToUserMessage(new Error("fetch failed: ECONNRESET"), "生成失败，请稍后重试"))
      .toBe("生成失败，请稍后重试")
    expect(mapAimErrorToUserMessage(new Error("Internal Server Error"), "生成失败，请稍后重试"))
      .toBe("生成失败，请稍后重试")
    expect(mapAimErrorToUserMessage(new Error("Unexpected token < in JSON"), "生成失败，请稍后重试"))
      .toBe("生成失败，请稍后重试")
  })

  it("中文内部协议错误也不向用户透传", () => {
    const fallback = "生成失败，请稍后重试"
    expect(mapAimErrorToUserMessage(new Error("语义理解协议不完整"), fallback))
      .toBe("这次没有完整理解你的要求，当前内容已保留。请再试一次，或补充一句最关键的要求。")
    expect(mapAimErrorToUserMessage(new Error("语义理解包含业务动作标签"), fallback))
      .toBe("这次没有完整理解你的要求，当前内容已保留。请再试一次，或补充一句最关键的要求。")
    expect(mapAimErrorToUserMessage(new Error("澄清协议必须包含一个具体问题"), fallback))
      .toBe("这次没有完整理解你的要求，当前内容已保留。请再试一次，或补充一句最关键的要求。")
    expect(mapAimErrorToUserMessage(new Error("非澄清响应不得包含澄清问题"), fallback))
      .toBe("这次没有完整理解你的要求，当前内容已保留。请再试一次，或补充一句最关键的要求。")
  })

  it("空消息/非 Error 回落到友好文案", () => {
    expect(mapAimErrorToUserMessage(new Error(""), "兜底")).toBe("兜底")
    expect(mapAimErrorToUserMessage("plain string", "兜底")).toBe("兜底")
    expect(mapAimErrorToUserMessage(undefined, "兜底")).toBe("兜底")
  })
})

describe("aim failure codes", () => {
  it("maps timeout, deadline and delivery leak to distinct user actions", () => {
    expect(classifyAimFailure(new AimDeadlineExceededError())).toBe("GENERATION_DEADLINE")
    expect(classifyAimFailure(new AimDeliveryContentError(["reasoning_leak"]))).toBe("DELIVERY_REASONING_LEAK")
    expect(classifyAimFailure(new Error("timeout"), [{
      provider: "zenmux", status: "failed", attemptIndex: 0, errorKind: "timeout", error: "timed out",
    }])).toBe("MODEL_TIMEOUT")
    expect(mapAimFailureCodeToUserMessage("MODEL_TIMEOUT")).toContain("更换线路")
    expect(mapAimFailureCodeToUserMessage("GENERATION_DEADLINE")).toContain("等待上限")
    expect(mapAimFailureCodeToUserMessage("DELIVERY_REASONING_LEAK")).toContain("未作为正式成稿")
    expect(mapAimFailureCodeToUserMessage("MODEL_TIMEOUT")).not.toContain("补充")
  })
})
