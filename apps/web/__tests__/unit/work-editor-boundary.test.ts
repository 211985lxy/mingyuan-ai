import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import { WorkEditorHandler } from "@/lib/aim-agent-work-editor"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@/lib/aim-generation-prompts", () => ({
  CONTENT_CREATION_TRACE_RULE: "透明创作说明",
  buildWorkflowContext: vi.fn(() => ""),
  ensureContentCreationTrace: vi.fn((content: string) => content),
  executeGenerateLLMWithBenchmarkRetry: mocks.execute,
}))

vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: mocks.save,
}))

describe("work editor boundaries", () => {
  beforeEach(() => {
    mocks.execute.mockReset().mockResolvedValue({
      completion: { content: "润色后的成稿" },
      parsed: { raw_copy: "润色后的成稿" },
    })
    mocks.save.mockReset().mockResolvedValue({ id: "generation-1", knowledgeUsed: [] })
  })

  it("keeps polish/layout focus and rejects deep-longform framing", async () => {
    const context = {
      targetFormats: ["video_script", "raw_copy"],
      rawInput: "请对下面成稿做文字二改/润色，去 AI 味。\n\n原文：……",
      knowledgeBlock: "",
      methodologyBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
    } as unknown as AimGenerateContext

    const result = await new WorkEditorHandler().generate(context)
    const [, systemPrompt, , , safeTargets] = mocks.execute.mock.calls[0]

    expect(result.results.map((item) => item.format)).toEqual(["raw_copy"])
    expect(safeTargets).toEqual(["raw_copy"])
    expect(systemPrompt).toContain("文字二改/润色")
    expect(systemPrompt).toContain("公众号排版")
    expect(systemPrompt).toContain("小红书图文")
    expect(systemPrompt).toContain("禁止从零写深度长文")
    expect(systemPrompt).toContain("内容创作")
    expect(systemPrompt).not.toContain("先输出文案框架")
    expect(systemPrompt).not.toContain("一篇完整深度长文")
  })
})
