import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock("@/lib/aim-agent-model", () => ({
  executeGenerateLLM: mocks.execute,
}))

import { executeGenerateLLMWithBenchmarkRetry } from "@/lib/aim-generation-prompts"
import { AIM_FAST_SPOKEN_ROUTE_KEY } from "@/lib/aim-harness/fast-spoken-policy"
import {
  buildClosedWorldModelInput,
  buildGroundedNumericClaimRule,
} from "@/lib/aim-generation-guardrails"

function context(routeKey?: string) {
  return {
    rawInput: "围绕企业内容获客写一条完整口播",
    runtimeTask: "new_copy",
    targetFormats: ["video_script"],
    modelPolicy: {
      agentId: "content_producer",
      routeKey,
      stream: false,
      temperature: 0.8,
      maxTokens: routeKey ? 2500 : 8192,
      targetCapability: "advanced",
      minimumCapability: "standard",
      maxProviderAttempts: routeKey ? 1 : 3,
    },
  } as never
}

describe("AIM fast spoken generation budget", () => {
  beforeEach(() => {
    mocks.execute.mockReset()
  })

  it("stops after two incomplete model responses", async () => {
    mocks.execute.mockResolvedValue({
      content: "===FORMAT:video_script===\n这是一段没有写完的口播",
      finishReason: "stop",
    })

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      context(AIM_FAST_SPOKEN_ROUTE_KEY),
      ["video_script"],
    )).rejects.toThrow("已停止交付")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })

  it("blocks numeric claims that are absent from a strict user brief", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"60天产出40条内容，新增三个人。".repeat(8)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "只允许60天、40条，不得编造其他数字",
    } as never

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )).rejects.toThrow("事实风险")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute.mock.calls[0]?.[2]).toContain("正文只能使用用户原文已有的数字表达")
  })

  it("treats 元 and 块 as the same grounded currency claim", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"60天产出40条内容，线索成本从800块降到210块。".repeat(6)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "60天产出40条，成本从800元降到210元，不得编造其他数字",
    } as never

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )).resolves.toBeDefined()
  })

  it("allows singular content determiners without treating them as fabricated metrics", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"每一条内容都应该承担明确任务，而不是碰运气。".repeat(8)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as never

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )).resolves.toBeDefined()
  })

  it("allows creative time and structure numbers outside hard business claims", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"前三秒先说痛点，再用三条方法把观点讲清楚。".repeat(8)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as never

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )).resolves.toBeDefined()
  })

  it("allows generic customer counts used as creative scene setting", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"每一个客户看到内容之后，都应该知道下一步该做什么。".repeat(8)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as never

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )).resolves.toBeDefined()
  })

  it("still blocks fabricated first-person customer evidence", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"找到我的小企业老板，大多都卡在内容无法稳定获客。".repeat(8)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as never

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )).rejects.toThrow("事实风险")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })

  it("materializes the approved customer facts instead of letting the model expand them", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n痛点开头。我们已经帮不少企业解决过类似难题。${"完整展开。".repeat(12)}\n\n[[APPROVED_FACTS]]\n\n他们在我们支持下又产出40条高质量内容。\n\n评论领取清单。`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "必须准确引用两个事实：60天产出40条内容、获得127条线索；成本从800元降到210元。痛点是产能不稳。结尾只引导评论领取诊断清单。不得编造其他数字",
    } as never

    const result = await executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user [[APPROVED_FACTS]]",
      strictContext,
      ["video_script"],
    )

    expect(result.parsed.video_script).toContain("60天产出40条内容、获得127条线索")
    expect(result.parsed.video_script).not.toContain("[[APPROVED_FACTS]]")
    expect(result.parsed.video_script).not.toContain("在我们支持下")
    expect(result.parsed.video_script).not.toContain("帮不少企业")
    expect(result.parsed.video_script?.match(/40条/g)).toHaveLength(1)
    expect(result.parsed.video_script).toMatch(/评论领取诊断清单。$/)
  })

  it("deterministically appends approved facts when the model omits the marker", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"内容做了很多，精准线索却不稳定，问题在于缺少转化路径。".repeat(8)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "必须准确引用两个事实：60天产出40条内容、获得127条线索；成本从800元降到210元。目标客户是小企业老板。痛点是线索不稳。结尾只引导评论领取诊断清单。不得编造其他数字",
    } as never

    const result = await executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      strictContext,
      ["video_script"],
    )

    expect(result.parsed.video_script).toContain("60天产出40条内容、获得127条线索")
    expect(result.parsed.video_script).toContain("成本从800元降到210元")
    expect(result.parsed.video_script).not.toContain("[[APPROVED_FACTS]]")
    expect(result.parsed.video_script).toMatch(/评论领取诊断清单。$/)
  })

  it("hides approved facts from the model and exposes only the marker", () => {
    const rawInput = "必须准确引用两个事实：某公司60天产出40条内容、获得127条线索。目标客户是获客不稳的小企业老板。痛点是产能不稳。不得编造其他数字"

    expect(buildClosedWorldModelInput(rawInput)).not.toContain("60天产出40条")
    expect(buildClosedWorldModelInput(rawInput)).toContain("[[APPROVED_FACTS]]")
    expect(buildClosedWorldModelInput(rawInput)).toContain("目标客户是获客不稳的小企业老板")
    expect(buildGroundedNumericClaimRule(rawInput)).not.toContain("60天")
  })

  it("keeps the existing retry behavior outside the fast route", async () => {
    mocks.execute
      .mockResolvedValueOnce({
        content: "===FORMAT:video_script===\n这是一段没有写完的口播",
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        content: `===FORMAT:video_script===\n${"这是完整口播内容，包含目标客户、真实痛点和行动建议。".repeat(8)}`,
        finishReason: "stop",
      })

    const result = await executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      context(),
      ["video_script"],
    )

    expect(result.parsed.video_script).toContain("目标客户")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })
})
