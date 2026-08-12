import { describe, expect, it } from "vitest"
import { resolveLlmQuality, type AimLlmQualityScenario } from "@/lib/aim-harness/llm-quality-policy"

describe("resolveLlmQuality", () => {
  // 每个场景的 run 值与历史硬编码逐一对应，保证收敛后零行为变化。
  it.each<[AimLlmQualityScenario, boolean]>([
    ["agent_api", false],
    ["inspiration", false],
    ["meeting_insight", false],
    ["fast_spoken", false],
    ["eval", false],
    ["main_generate", true],
  ])("scenario %s → run=%s 且 reason 非空", (scenario, run) => {
    const decision = resolveLlmQuality(scenario)
    expect(decision.run).toBe(run)
    expect(decision.reason.trim().length).toBeGreaterThan(0)
  })

  it("所有跳过场景 run=false（守护历史行为）", () => {
    const skipScenarios: AimLlmQualityScenario[] = [
      "agent_api",
      "inspiration",
      "meeting_insight",
      "fast_spoken",
      "eval",
    ]
    for (const scenario of skipScenarios) {
      expect(resolveLlmQuality(scenario).run).toBe(false)
    }
  })
})
