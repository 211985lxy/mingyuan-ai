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
    // 连接层错误自 2026-09-08 整改起映射为可恢复的「更换线路」文案，不再落泛化兜底
    expect(mapAimErrorToUserMessage(new Error("fetch failed: ECONNRESET"), "生成失败，请稍后重试"))
      .toBe("模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。")
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
  it("maps timeout, deadline and delivery leak to distinct V2 user actions", () => {
    expect(classifyAimFailure(new AimDeadlineExceededError())).toBe("MODEL_TIMEOUT")
    expect(classifyAimFailure(new AimDeliveryContentError(["reasoning_leak"]))).toBe("DELIVERY_CONSTRAINT_VIOLATION")
    expect(classifyAimFailure(new Error("timeout"), [{
      provider: "zenmux", status: "failed", attemptIndex: 0, errorKind: "timeout", error: "timed out",
    }])).toBe("MODEL_TIMEOUT")
    expect(classifyAimFailure({ code: "GENERATION_DEADLINE" })).toBe("MODEL_TIMEOUT")
    expect(classifyAimFailure({ code: "DELIVERY_REASONING_LEAK" })).toBe("DELIVERY_CONSTRAINT_VIOLATION")
    expect(classifyAimFailure({ code: "MODEL_EMPTY_RESPONSE" })).toBe("EMPTY_OUTPUT")
    expect(classifyAimFailure({ code: "PROVIDER_BALANCE" })).toBe("PROVIDER_QUOTA")
    expect(mapAimFailureCodeToUserMessage("MODEL_TIMEOUT")).toContain("更换线路")
    expect(mapAimFailureCodeToUserMessage("DELIVERY_CONSTRAINT_VIOLATION")).toContain("未作为正式成稿")
    expect(mapAimFailureCodeToUserMessage("MODEL_TIMEOUT")).not.toContain("补充")
    expect(mapAimFailureCodeToUserMessage("PROVIDER_QUOTA")).not.toContain("补充")
  })

  // 2026-09-08 生产事故回归：当晨代理故障 zenmux/apimart 全部 "Connection error."，
  // 被归为 INTERNAL_ERROR →「生成失败，请稍后重试」，且熔断全跳时零 attempt 可查。
  it("classifies connection/server and circuit-blackout failures as recoverable PROVIDER_UNAVAILABLE", () => {
    const networkAttempts = [{
      provider: "zenmux", status: "failed" as const, attemptIndex: 0,
      errorKind: "network" as const, error: "Connection error.",
    }]
    expect(classifyAimFailure(new Error("Connection error."), networkAttempts))
      .toBe("PROVIDER_UNAVAILABLE")

    const serverAttempts = [{
      provider: "apimart", status: "failed" as const, attemptIndex: 1,
      errorKind: "server" as const, error: "500 get_channel_failed",
    }]
    expect(classifyAimFailure(new Error("Internal Server Error"), serverAttempts))
      .toBe("PROVIDER_UNAVAILABLE")

    expect(classifyAimFailure(new Error("[llm] All providers failed")))
      .toBe("PROVIDER_UNAVAILABLE")
    expect(classifyAimFailure(new Error("全部模型线路均处于熔断保护中（4 条跳过），请稍后重试")))
      .toBe("PROVIDER_UNAVAILABLE")

    // 分类结果必须指向可恢复的用户动作（自动换线路重试），而不是泛化的「请稍后重试」
    const code = classifyAimFailure(new Error("Connection error."))
    expect(mapAimFailureCodeToUserMessage(code)).toContain("更换线路")
  })
})
