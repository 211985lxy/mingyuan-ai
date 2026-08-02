import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import { FreeCopywriterHandler } from "@/lib/aim-agent-free-copywriter"

const mocks = vi.hoisted(() => ({ execute: vi.fn(), save: vi.fn() }))

vi.mock("@/lib/aim-agent-model", () => ({
  executeChatLLM: vi.fn(),
  executeChatLLMStream: vi.fn(),
}))

vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: mocks.save,
}))

vi.mock("@/lib/aim-generation-prompts", () => ({
  buildCompactWorkflowContext: vi.fn(() => ""),
  CONTENT_CREATION_TRACE_RULE: "",
  ensureContentCreationTrace: vi.fn((content: string) => content),
  executeGenerateLLMWithBenchmarkRetry: mocks.execute,
}))

describe("FreeCopywriterHandler light edit prompt", () => {
  beforeEach(() => {
    mocks.execute.mockReset().mockResolvedValue({
      completion: { content: "AI 提效不是口号。" },
      parsed: { raw_copy: "AI 提效不是口号。" },
    })
    mocks.save.mockReset().mockResolvedValue({ id: "gen-1", knowledgeUsed: [] })
  })

  it("passes the requested edit and local-edit boundary to the model", async () => {
    const context = {
      agentId: "free_copywriter",
      userId: "u1",
      rawInput: "原稿：AI 可以帮助企业提升效率，但这段表达太空。",
      polishInstruction: "只修改开头，让它更具体，不要改动其他信息。",
      runtimeTask: "light_edit",
      targetFormats: ["raw_copy"],
      knowledgeBlock: "",
      methodologyBlock: "",
      selectedMethodologyBlock: "",
      businessDiagnosisBlock: "",
      viralStructureBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      retrievedEntries: [],
      retrievedSource: "raw",
      knowledgeStrategy: "light_edit",
    } as AimGenerateContext

    await new FreeCopywriterHandler().generate(context)

    const systemPrompt = mocks.execute.mock.calls[0][1] as string
    const userPrompt = mocks.execute.mock.calls[0][2] as string
    expect(systemPrompt).toContain("只改用户点名的部分")
    expect(systemPrompt).toContain("输出只能是开头候选或开头替换稿")
    expect(userPrompt).toContain("修改要求：只修改开头，让它更具体，不要改动其他信息。")
  })
})
