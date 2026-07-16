import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import { DeepCopywriterHandler } from "@/lib/aim-agent-deep-copywriter"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@/lib/aim-generation-prompts", () => ({
  buildWorkflowContext: vi.fn(() => ""),
  executeGenerateLLMWithBenchmarkRetry: mocks.execute,
}))

vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: mocks.save,
}))

describe("deep copywriter boundaries", () => {
  beforeEach(() => {
    mocks.execute.mockReset().mockResolvedValue({
      completion: { content: "完整长文正文" },
      parsed: { raw_copy: "完整长文正文" },
    })
    mocks.save.mockReset().mockResolvedValue({ id: "generation-1", knowledgeUsed: [] })
  })

  it("forces one long-form draft and passes the no-tail rule to the model", async () => {
    const context = {
      targetFormats: ["video_script", "raw_copy"],
      rawInput: "直接写一篇完整长文",
      knowledgeBlock: "",
      methodologyBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
    } as unknown as AimGenerateContext

    const result = await new DeepCopywriterHandler().generate(context)
    const [, systemPrompt, , , safeTargets] = mocks.execute.mock.calls[0]

    expect(result.results.map((item) => item.format)).toEqual(["raw_copy"])
    expect(safeTargets).toEqual(["raw_copy"])
    expect(systemPrompt).toContain('"可拆分方向"模块')
    expect(systemPrompt).toContain("私域话术")
    expect(systemPrompt).toContain("正文最后一句写完就停止")
    expect(systemPrompt).toContain("确认尾句")
  })
})
