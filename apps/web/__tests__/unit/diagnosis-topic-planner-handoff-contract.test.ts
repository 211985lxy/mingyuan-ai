import { describe, expect, it, vi } from "vitest"
import { getAimAgentGuide } from "@/lib/aim-agent-guides"
import { BusinessDiagnosisHandler } from "@/lib/aim-agent-business-diagnosis"
import { BusinessSystemDiagnosisHandler } from "@/lib/aim-agent-business-system-diagnosis"
import type { AimChatParams } from "@/lib/aim-agent-handlers"

/**
 * 诊断官 → 选题官 链路衔接契约测试。
 *
 * 守护两个易混智能体（business_system_diagnosis 商业诊断官 / business_diagnosis 选题策划官）
 * 之间的衔接一致性，防止历史出现过的两类问题回归：
 * 1. 跳转 label 与 prompt 语义错位（label 写"选题策划"但 prompt 要"生成天命全案"）
 * 2. 两者【禁止输出】清单不一致（一个禁小红书图文、一个不禁）
 */

const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock("@/lib/aim-agent-model", () => ({
  executeChatLLM: mocks.execute,
  executeChatLLMStream: mocks.execute,
  executeGenerateLLM: mocks.execute,
}))
vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: vi.fn().mockResolvedValue({ id: "g1", knowledgeUsed: [] }),
}))
vi.mock("@/lib/aim-generation-prompts", () => ({
  buildWorkflowContext: vi.fn(() => ""),
  ensureContentCreationTrace: vi.fn((c: string) => c),
  CONTENT_CREATION_TRACE_RULE: "",
  executeGenerateLLMWithBenchmarkRetry: mocks.execute,
}))

function chatParams(): AimChatParams {
  return {
    userId: "u1",
    messages: [{ role: "user", content: "帮我做一次生意系统体检" }],
    knowledgeBlock: "",
    conversationBlock: "",
    methodologyBlock: "",
    businessDiagnosisBlock: "",
    ipWikiBlock: "",
  } as unknown as AimChatParams
}

describe("诊断官 → 选题官：跳转 label 与 prompt 语义一致", () => {
  it("business_system_diagnosis 指向天命全案的 nextAction，label 不再误写为「带入选题策划」", () => {
    const guide = getAimAgentGuide("business_system_diagnosis")
    // 找到 prompt 含「天命IP资产化操盘全案」的那条 nextAction
    const toTopicPlanner = guide.nextActions.find((a) => a.prompt.includes("天命IP资产化操盘全案"))
    expect(toTopicPlanner, "应存在指向天命全案的跳转").toBeTruthy()
    if (toTopicPlanner) {
      // label 必须与 prompt 语义一致，不能是误导性的"带入选题策划"
      expect(toTopicPlanner.label).not.toBe("带入选题策划")
      expect(toTopicPlanner.label).toContain("天命全案")
    }
  })
})

describe("诊断官与选题官：【禁止输出】清单对齐", () => {
  it("两者都禁止「小红书图文」营销分发内容", async () => {
    mocks.execute.mockReset().mockResolvedValue({ content: "ok" })
    await new BusinessDiagnosisHandler().chat(chatParams())
    const topicPlannerPrompt = mocks.execute.mock.calls[0][1] as string

    await new BusinessSystemDiagnosisHandler().chat(chatParams())
    const diagnosisPrompt = mocks.execute.mock.calls[1][1] as string

    // 两者禁止清单都应含「小红书图文」，避免一个禁一个不禁的口径分裂
    expect(topicPlannerPrompt).toContain("小红书图文")
    expect(diagnosisPrompt).toContain("小红书图文")
  })
})
