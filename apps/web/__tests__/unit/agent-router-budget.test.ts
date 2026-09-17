import { beforeEach, describe, expect, it, vi } from "vitest"

const ctorArgs: Array<Record<string, unknown>> = []

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(config: Record<string, unknown>) {
      ctorArgs.push(config)
    }

    chat = {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>) => ({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          model: String(body.model || "test-model"),
        })),
      },
    }
  },
}))

/**
 * 生成链的预算不变量。
 *
 * 背景（2026-09-15）：QUALITY_PRIMARY_ROUTE 各跳超时之和曾经是 160s，而可用预算只有
 * 110s。四跳永远跑不完，末跳被 resolveProviderTimeoutMs 压成零头，每一轮失败都要让
 * 用户等满整段预算再收 MODEL_TIMEOUT（错误码 3）。此前没有任何测试盯着这个加法，
 * 所以它可以一路漂到 160s 而无人发现。
 *
 * 这两个断言就是那道闸：改 agent-router 的超时数字前，先看这里会不会红。
 */

/** 生成总预算里必须留给语义验收 / 修订轮（unified-content-execution maxRevisions=2）的余量。 */
const MIN_POST_LLM_RESERVE_MS = 10_000

const GENERATION_AGENTS = [
  "content_producer",
  "business_diagnosis",
  "business_system_diagnosis",
  "content_producer.fast_spoken",
] as const

describe("agent router 生成链预算不变量", () => {
  beforeEach(() => {
    ctorArgs.length = 0
    process.env.ZENMUX_API_KEY = "test-zenmux"
    process.env.ZENMUX_ALLOW_DIRECT = "true"
    process.env.DEEPSEEK_API_KEY = "test-deepseek"
    process.env.APIMART_API_KEY = "test-apimart"
    process.env.DOUBAO_API_KEY = "test-doubao"
    vi.resetModules()
  })

  it("理解阶段不吃掉整份预算，给生成阶段留下首跳机会", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    const { AIM_EXECUTION_DEADLINE_MS, AIM_DEADLINE_TAIL_MS } = await import("@/lib/llm/execution-deadline")

    ctorArgs.length = 0
    getAgentLLM("aim.understanding")
    const understandingTimeouts = ctorArgs
      .map((config) => config.timeout)
      .filter((timeout): timeout is number => typeof timeout === "number")

    ctorArgs.length = 0
    getAgentLLM("content_producer")
    const generationTimeouts = ctorArgs
      .map((config) => config.timeout)
      .filter((timeout): timeout is number => typeof timeout === "number")

    expect(understandingTimeouts.length).toBeGreaterThanOrEqual(2)
    expect(generationTimeouts.length).toBeGreaterThanOrEqual(3)

    // 两个阶段共享同一份 115s：理解最坏耗时 + 生成首跳必须仍放得进总预算，
    // 否则理解一慢，生成连第一跳的机会都没有，用户直接拿到超时。
    const usableBudget = AIM_EXECUTION_DEADLINE_MS - AIM_DEADLINE_TAIL_MS
    const understandingWorst = understandingTimeouts.reduce((sum, timeout) => sum + timeout, 0)
    const firstGenerationHop = generationTimeouts[0]

    expect(
      understandingWorst + firstGenerationHop,
      `理解阶段最坏 ${understandingWorst}ms + 生成首跳 ${firstGenerationHop}ms 超出可用预算 ${usableBudget}ms`,
    ).toBeLessThanOrEqual(usableBudget)
  })

  it("快口播每跳不超过它自己的单跳上限", async () => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    const { AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS } = await import("@/lib/aim-harness/fast-spoken-policy")

    ctorArgs.length = 0
    getAgentLLM("content_producer.fast_spoken")
    const routeTimeouts = ctorArgs
      .map((config) => config.timeout)
      .filter((timeout): timeout is number => typeof timeout === "number")

    expect(routeTimeouts.length).toBeGreaterThanOrEqual(3)
    // AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS 曾是导出后无人引用的死常量，
    // 这条断言让它变成真实生效的契约：快口播任何一跳都不得慢过它。
    for (const timeout of routeTimeouts) {
      expect(
        timeout,
        `快口播单跳超时 ${timeout}ms 超过 AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS=${AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS}ms`,
      ).toBeLessThanOrEqual(AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS)
    }
  })

  it.each(GENERATION_AGENTS)("%s 的各跳超时之和放得进总预算", async (agentId) => {
    const { getAgentLLM } = await import("@/lib/llm/agent-router")
    const { AIM_EXECUTION_DEADLINE_MS, AIM_DEADLINE_TAIL_MS } = await import("@/lib/llm/execution-deadline")

    ctorArgs.length = 0
    getAgentLLM(agentId)
    const routeTimeouts = ctorArgs
      .map((config) => config.timeout)
      .filter((timeout): timeout is number => typeof timeout === "number")

    // 路由表里每一跳都必须显式声明超时，否则会静默继承 provider 默认值（当前 60s），
    // 加法失效、预算又算不平。也不能只收集到一跳，否则下面的加法断言会假绿。
    expect(routeTimeouts.length, `${agentId} 的降级链不足三跳，加法断言会失去意义`).toBeGreaterThanOrEqual(3)

    const usableBudget = AIM_EXECUTION_DEADLINE_MS - AIM_DEADLINE_TAIL_MS
    const total = routeTimeouts.reduce((sum, timeout) => sum + timeout, 0)

    // 硬不变量：跑满每一跳也不能超出可用预算。
    expect(total, `各跳超时之和 ${total}ms 超出可用预算 ${usableBudget}ms`).toBeLessThanOrEqual(usableBudget)
    // 留白不变量：还要给语义验收 / 修订轮留出余量。
    expect(
      total,
      `各跳超时之和 ${total}ms 未给验收与修订轮留下 ${MIN_POST_LLM_RESERVE_MS}ms 余量`,
    ).toBeLessThanOrEqual(usableBudget - MIN_POST_LLM_RESERVE_MS)
    // 单跳不得吃掉整段余量：某一跳超时配得过大时，前面几跳失败后它就只剩零头。
    for (const timeout of routeTimeouts) {
      expect(
        timeout,
        `单跳超时 ${timeout}ms 过大，挤压其余跳与验收轮`,
      ).toBeLessThanOrEqual(usableBudget - MIN_POST_LLM_RESERVE_MS)
    }
  })
})
