import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock("@/lib/aim-agent-model", () => ({
  executeGenerateLLM: mocks.execute,
}))

import { executeGenerateLLMWithBenchmarkRetry } from "@/lib/aim-generation-prompts"
import { fitOverlongSpokenContent } from "@/lib/aim-spoken-length"
import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import { AIM_FAST_SPOKEN_ROUTE_KEY } from "@/lib/aim-harness/fast-spoken-policy"
import {
  buildClosedWorldModelInput,
  buildGroundedNumericClaimRule,
  materializeApprovedFacts,
  redactApprovedFactsForRewrite,
} from "@/lib/aim-generation-guardrails"

function context(routeKey?: string): AimGenerateContext {
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
  } as AimGenerateContext
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

  it("accepts a complete one-minute script at its requested floor", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"先讲问题，再给方法，最后引导行动。".repeat(13)}`,
      finishReason: "stop",
    })

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      { ...context(AIM_FAST_SPOKEN_ROUTE_KEY), rawInput: "出一版抖音口播，1分钟，讲内容获客痛点。" },
      ["video_script"],
    )).resolves.toBeDefined()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  it("retries a light edit that stops at an unfinished clause without enforcing spoken length", async () => {
    mocks.execute
      .mockResolvedValueOnce({
        content: "===FORMAT:raw_copy===\nAI 可以帮助企业提升效率，",
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        content: "===FORMAT:raw_copy===\n比如用 AI 接手重复工作，企业能把精力留给更重要的判断。",
        finishReason: "stop",
      })
    const lightEditContext = {
      ...context(),
      rawInput: "AI 可以帮助企业提升效率",
      runtimeTask: "light_edit",
      targetFormats: ["raw_copy"],
    } as AimGenerateContext

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer", "system", "user", lightEditContext, ["raw_copy"],
    )).resolves.toBeDefined()
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute.mock.calls[1]?.[2]).toContain("只补齐中断的句子")
    expect(mocks.execute.mock.calls[1]?.[2]).not.toContain("正文目标是 400-500")
  })

  it("rewrites an overlong two-minute script within the delivery bound", async () => {
    mocks.execute
      .mockResolvedValueOnce({
        content: `===FORMAT:video_script===\n${"这是明显超过时长但没有句间停顿的完整口播内容".repeat(60)}。`,
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        content: `===FORMAT:video_script===\n${"这是面向企业老板的完整口播，讲清问题、判断和行动。".repeat(18)}`,
        finishReason: "stop",
      })

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      context(AIM_FAST_SPOKEN_ROUTE_KEY),
      ["video_script"],
    )).resolves.toBeDefined()
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute.mock.calls[1]?.[2]).toContain("篇幅过长")
    expect(mocks.execute.mock.calls[1]?.[2]).toContain("目标是 400-500 个有效字符")
    expect(mocks.execute.mock.calls[1]?.[2]).toContain("验收范围是 330-550")
    expect(mocks.execute.mock.calls[1]?.[3]).toMatchObject({ temperature: 0.2 })
  })

  it("fits a complete overlong script by whole sentences without dropping delivery anchors", () => {
    const rawInput = "为中小企业老板写一条2分钟口播。痛点是有想法没产能、AI味重。必须准确引用两个事实：某公司60天产出40条内容、获得127条线索；成本从800元降到210元。结尾只引导评论领取诊断清单。不得编造其他数字"
    const content = [
      "如果你是已经有团队的中小企业老板，这条讲给你听。",
      "你有想法没产能，成稿还有明显AI味。",
      "团队每天都在重新开会，选题反复讨论，稿子来回修改，发布节奏持续波动。".repeat(20),
      "问题反复出现，因为团队缺少稳定的生产逻辑。",
      "先固定目标客户和销售场景，再统一结构并按线索质量复盘。",
      "某公司60天产出40条内容、获得127条线索；成本从800元降到210元。",
      "评论领取诊断清单。",
    ].join("\n\n")

    const fitted = fitOverlongSpokenContent(content, rawInput)
    const length = (fitted.match(/[\p{Script=Han}\p{Letter}\p{Number}]/gu) ?? []).length

    expect(length).toBeGreaterThanOrEqual(330)
    expect(length).toBeLessThanOrEqual(550)
    expect(fitted).toContain("有想法没产能")
    expect(fitted).toContain("因为团队缺少稳定的生产逻辑")
    expect(fitted).toContain("先固定目标客户")
    expect(fitted).toContain("60天产出40条内容")
    expect(fitted).toMatch(/评论领取诊断清单。$/)
  })

  it("blocks a strict script when removing unauthorized numeric sentences leaves no deliverable", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"60天产出40条内容，新增三个人。".repeat(30)}`,
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
    )).rejects.toThrow("已停止交付")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute.mock.calls[0]?.[2]).toContain("正文只能使用用户原文已有的数字表达")
  })

  it("treats 元 and 块 as the same grounded currency claim", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"60天产出40条内容，线索成本从800块降到210块。".repeat(20)}`,
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
      content: `===FORMAT:video_script===\n${"每一条内容都应该承担明确任务，而不是碰运气。".repeat(20)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as AimGenerateContext

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer", "system", "user", strictContext, ["video_script"],
    )).resolves.toBeDefined()
  })

  it("allows Chinese structural numbers but not ungrounded business metrics", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"前三秒先说痛点，再用三条方法把观点讲清楚。".repeat(20)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as AimGenerateContext

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer", "system", "user", strictContext, ["video_script"],
    )).resolves.toBeDefined()
  })

  it("still blocks fabricated first-person customer evidence", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"找到我的小企业老板，大多都卡在内容无法稳定获客。".repeat(20)}`,
      finishReason: "stop",
    })
    const strictContext = {
      ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
      rawInput: "围绕内容获客写口播，不得编造其他数字",
    } as AimGenerateContext

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer", "system", "user", strictContext, ["video_script"],
    )).rejects.toThrow("事实风险")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })

  it("allows creative marketing statistics without a safety retry", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n${"90%的老板都把内容获客做错了。".repeat(30)}`,
      finishReason: "stop",
    })

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      context(AIM_FAST_SPOKEN_ROUTE_KEY),
      ["video_script"],
    )).resolves.toBeDefined()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  it("still stops creative numbers when the user explicitly forbids fabrication", async () => {
    mocks.execute
      .mockResolvedValueOnce({
        content: `===FORMAT:video_script===\n${"90%的老板都把内容获客做错了。".repeat(30)}`,
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        content: `===FORMAT:video_script===\n${"一元投入就能带来客户。".repeat(40)}`,
        finishReason: "stop",
      })

    await expect(executeGenerateLLMWithBenchmarkRetry(
      "content_producer",
      "system",
      "user",
      {
        ...context(AIM_FAST_SPOKEN_ROUTE_KEY),
        rawInput: "围绕内容获客写口播，不得编造其他数字",
      },
      ["video_script"],
    )).rejects.toThrow("已停止交付")
    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })

  it("materializes the approved customer facts instead of letting the model expand them", async () => {
    mocks.execute.mockResolvedValue({
      content: `===FORMAT:video_script===\n痛点开头。我们已经帮不少企业解决过类似难题。${"完整展开。".repeat(80)}\n\n[[APPROVED_FACTS]]\n\n他们在我们支持下又产出40条高质量内容。\n\n[[APPROVED_FACTS]] 评论领取清单。`,
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

  it("hides approved facts from the model and exposes only the marker", () => {
    const rawInput = "必须准确引用两个事实：某公司60天产出40条内容、获得127条线索。目标客户是获客不稳的小企业老板。痛点是产能不稳。不得编造其他数字"

    expect(buildClosedWorldModelInput(rawInput)).not.toContain("60天产出40条")
    expect(buildClosedWorldModelInput(rawInput)).toContain("[[APPROVED_FACTS]]")
    expect(buildClosedWorldModelInput(rawInput)).toContain("目标客户是获客不稳的小企业老板")
    expect(buildGroundedNumericClaimRule(rawInput)).not.toContain("60天")
  })

  it("redacts approved facts again before a length rewrite", () => {
    const rawInput = "必须准确引用两个事实：某公司60天产出40条内容、获得127条线索。痛点是产能不稳。不得编造其他数字"
    const previous = "开头。\n\n某公司60天产出40条内容、获得127条线索\n\n结尾。"

    expect(redactApprovedFactsForRewrite(previous, rawInput)).toContain("[[APPROVED_FACTS]]")
    expect(redactApprovedFactsForRewrite(previous, rawInput)).not.toContain("127条线索")
  })

  it("inserts approved facts deterministically when a provider drops the marker", () => {
    const rawInput = "必须准确引用两个事实：某公司60天产出40条内容、获得127条线索；成本从800元降到210元。痛点是产能不稳。结尾只引导评论领取诊断清单。不得编造其他数字"
    const content = `${"团队有想法却持续写不出来，内容也总有机器味。".repeat(20)}某公司60天产出40条内容。评论领取其他资料。`
    const result = materializeApprovedFacts(content, rawInput)

    expect(result).toContain("团队有想法却持续写不出来")
    expect(result.match(/60天产出40条内容/g)).toHaveLength(1)
    expect(result).not.toContain("评论领取其他资料")
    expect(result).toMatch(/评论领取诊断清单。$/)
  })

  it("keeps the existing retry behavior outside the fast route", async () => {
    mocks.execute
      .mockResolvedValueOnce({
        content: "===FORMAT:video_script===\n这是一段没有写完的口播",
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        content: `===FORMAT:video_script===\n${"这是完整口播内容，包含目标客户、真实痛点和行动建议。".repeat(20)}`,
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

  it("does not spend a second model call on pain classification", () => {
    const contextLoader = readFileSync(
      join(process.cwd(), "src/lib/aim-harness/context/load-generation-blocks.ts"),
      "utf8",
    )

    expect(contextLoader).toContain("!isAimFastSpokenRoute(spec.modelPolicy.routeKey)")
  })
})
