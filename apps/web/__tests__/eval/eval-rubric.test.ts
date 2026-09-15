import { beforeEach, describe, expect, it, vi } from "vitest"

const complete = vi.fn()

vi.mock("@/lib/llm/agent-router", () => ({
  getAgentLLM: () => ({ complete }),
}))

import { ALL_FIXTURES } from "./fixtures"
import {
  EVAL_JUDGE_RETRY_ATTEMPTS,
  judgeEvalCase,
  parseJudgePayload,
} from "@/lib/aim-harness/eval-rubric"

describe("eval rubric judge", () => {
  const fixture = ALL_FIXTURES.find((item) => item.id === "cp_learnings_hallucination_26")!

  beforeEach(() => {
    complete.mockReset()
    delete process.env.AIM_EVAL_PROVIDER_OFFSET
  })

  it("parses fenced JSON and string scores", () => {
    expect(parseJudgePayload('```json\n{"score":"88","reasons":"过关","fabricatedFact":false}\n```')).toEqual({
      score: 88,
      reasons: "过关",
      fabricated: false,
    })
  })

  it("retries after invalid JSON then accepts a later score", async () => {
    complete
      .mockResolvedValueOnce({ content: "不是json", provider: "deepseek", model: "deepseek-flash" })
      .mockResolvedValueOnce({
        content: '{"score":86,"reasons":"引用了账单","fabricatedFact":false}',
        provider: "openrouter",
        model: "qwen/qwen3.7-plus",
      })

    const judged = await judgeEvalCase(fixture, "去年冬天电费从1800降到1100。", false)

    expect(complete).toHaveBeenCalledTimes(2)
    expect(judged.rubricScore).toBe(86)
    expect(judged.rubricJudgeProvider).toBe("openrouter")
    expect(judged.fabricatedFact).toBe(false)
    expect(process.env.AIM_EVAL_PROVIDER_OFFSET).toBeUndefined()
  })

  it("gives up with a null score after every judge attempt fails", async () => {
    complete.mockRejectedValue(new Error("empty response"))

    const judged = await judgeEvalCase(fixture, "去年冬天电费从1800降到1100。", false)

    expect(complete).toHaveBeenCalledTimes(EVAL_JUDGE_RETRY_ATTEMPTS)
    expect(judged.rubricScore).toBeNull()
    expect(judged.fabricatedFact).toBe(false)
  })

  it("caps fabricated drafts at 40", async () => {
    complete.mockResolvedValue({
      content: '{"score":90,"reasons":"编了亲历","fabricatedFact":true}',
      provider: "deepseek",
      model: "deepseek-flash",
    })

    const judged = await judgeEvalCase(fixture, "我接触过不少本地服务老板。", false)

    expect(judged.fabricatedFact).toBe(true)
    expect(judged.rubricScore).toBe(40)
  })
})
