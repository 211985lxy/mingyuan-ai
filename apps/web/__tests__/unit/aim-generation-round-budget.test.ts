import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import { AIM_SEMANTIC_REVISION_MIN_BUDGET_MS } from "@/lib/aim/semantic-delivery-verifier"
import { runWithAimExecutionDeadline } from "@/lib/llm/execution-deadline"

const mocks = vi.hoisted(() => ({ executeGenerateLLM: vi.fn() }))

vi.mock("@/lib/aim-agent-model", () => ({
  executeChatLLM: vi.fn(),
  executeChatLLMStream: vi.fn(),
  executeGenerateLLM: mocks.executeGenerateLLM,
}))

/**
 * 交付路径的返工预算闸。
 *
 * 交付路径不是"一次生成"，而是最多 3 轮（maxAttempts=3）：每轮跑一次完整生成，
 * 每轮还会追加一次语义验收（同一路模型调用，所以一次「生成 + 验收」= 两次调用）。
 * 此前没有预算闸，第一版写得慢一点就会把整段 115s 烧在注定跑不完的返工上，
 * 用户等满才拿到 MODEL_TIMEOUT（错误码 3）。
 *
 * 验收永远返回不可解析结论 → 循环持续想要进入下一轮，正好用来观察预算闸。
 */
const unusableCompletion = {
  // 带合法格式标记，让交付闸放行到语义验收；但验收协议标记缺失，验收必然判为不可解析。
  content: "===FORMAT:raw_copy===\n候选正文不含验收协议标记，验收必然判为不可解析",
  model: "test-model",
  provider: "test-provider",
  finishReason: "stop",
}

/** 一次「生成 + 验收」= 2 次 executeGenerateLLM 调用。 */
const CALLS_PER_ROUND = 2

function buildContext(): AimGenerateContext {
  return {
    userId: "u1",
    rawInput: "写一条口播",
    targetFormats: ["raw_copy"],
    unifiedContentExecution: {
      envelope: {
        currentUserRequest: "写一条口播",
        relevantConversation: [],
        referenceMaterials: [],
      },
      intent: {},
    },
  } as unknown as AimGenerateContext
}

describe("交付路径返工预算闸", () => {
  beforeEach(() => {
    mocks.executeGenerateLLM.mockReset().mockResolvedValue(unusableCompletion)
  })

  it("预算不足时不再启动返工轮，并以可重试的截止错误收手", async () => {
    const { executeGenerateLLMWithBenchmarkRetry } = await import("@/lib/aim-generation-prompts")

    const budgetMs = AIM_SEMANTIC_REVISION_MIN_BUDGET_MS - 5_000
    await expect(runWithAimExecutionDeadline(budgetMs, () =>
      executeGenerateLLMWithBenchmarkRetry("content_producer", "system", "user", buildContext(), ["raw_copy"]),
    )).rejects.toThrow("剩余预算不足以再完成一轮返工")

    // 关键：只跑了第 0 轮。第二、第三轮一次都没启动，用户不必等到 115s 才拿到结论。
    expect(mocks.executeGenerateLLM).toHaveBeenCalledTimes(CALLS_PER_ROUND)
  })

  it("预算充足时保持原有的三轮返工行为", async () => {
    const { executeGenerateLLMWithBenchmarkRetry } = await import("@/lib/aim-generation-prompts")

    await expect(runWithAimExecutionDeadline(600_000, () =>
      executeGenerateLLMWithBenchmarkRetry("content_producer", "system", "user", buildContext(), ["raw_copy"]),
    )).rejects.toThrow("连续修正后仍未完成当前要求")

    expect(mocks.executeGenerateLLM).toHaveBeenCalledTimes(CALLS_PER_ROUND * 3)
  })

  it("不在 deadline 作用域内时不影响既有行为（单测/直调路径）", async () => {
    const { executeGenerateLLMWithBenchmarkRetry } = await import("@/lib/aim-generation-prompts")

    await expect(
      executeGenerateLLMWithBenchmarkRetry("content_producer", "system", "user", buildContext(), ["raw_copy"]),
    ).rejects.toThrow("连续修正后仍未完成当前要求")

    expect(mocks.executeGenerateLLM).toHaveBeenCalledTimes(CALLS_PER_ROUND * 3)
  })
})
