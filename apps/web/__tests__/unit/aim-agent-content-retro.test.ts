import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import {
  buildContentRetroChatPrompt,
  buildContentRetroGeneratePrompt,
  buildPublishOutcomeSection,
} from "@/lib/aim-agent-content-retro-prompts"
import { ContentRetroHandler } from "@/lib/aim-agent-content-retro"

const mocks = vi.hoisted(() => ({
  executeGenerate: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@/lib/aim-agent-model", () => ({
  executeChatLLM: vi.fn(),
  executeChatLLMStream: vi.fn(),
  executeGenerateLLM: mocks.executeGenerate,
}))

vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: mocks.save,
}))

vi.mock("@/lib/aim-generation-prompts", () => ({
  buildWorkflowContext: vi.fn(() => ""),
}))

const SAMPLE_OUTCOME_BLOCK = [
  "平台：抖音",
  "发布后天数：7",
  "播放量：12800",
  "点赞：420",
  "评论：67",
  "完播率：31%",
].join("\n")

const FOUR_LAYER_DIAGNOSIS_TRACES = [
  "四层诊断",
  "生意系统四层",
  "流量交易层",
  "产品供给层",
  "经营结构层",
  "底层矛盾层",
]

describe("content retro prompts", () => {
  it("includes the publish outcome block when provided", () => {
    const section = buildPublishOutcomeSection(SAMPLE_OUTCOME_BLOCK)
    const chatPrompt = buildContentRetroChatPrompt({
      contextBlock: "企业知识库",
      publishOutcomeBlock: SAMPLE_OUTCOME_BLOCK,
    })
    const generatePrompt = buildContentRetroGeneratePrompt({
      knowledgeBlock: "企业知识库",
      publishOutcomeBlock: SAMPLE_OUTCOME_BLOCK,
    })

    expect(section).toContain("播放量：12800")
    expect(section).toContain("完播率：31%")
    expect(chatPrompt).toContain("播放量：12800")
    expect(generatePrompt).toContain("点赞：420")
    expect(chatPrompt).not.toContain("未登记发布数据")
    expect(generatePrompt).not.toContain("未登记发布数据")
  })

  it("uses the unregistered branch and forbids fabricating numbers when block is missing", () => {
    for (const block of [undefined, "", "   "]) {
      const section = buildPublishOutcomeSection(block)
      const chatPrompt = buildContentRetroChatPrompt({
        contextBlock: "企业知识库",
        publishOutcomeBlock: block,
      })
      const generatePrompt = buildContentRetroGeneratePrompt({
        knowledgeBlock: "企业知识库",
        publishOutcomeBlock: block,
      })

      expect(section).toContain("未登记发布数据")
      expect(section).toContain("请先去登记")
      expect(section).toContain("不许编造")
      expect(chatPrompt).toContain("未登记发布数据")
      expect(chatPrompt).toContain("请先去登记")
      expect(generatePrompt).toContain("未登记发布数据")
      expect(generatePrompt).toContain("请先去登记这条内容发布后的真实结果")

      // 未登记分支本身不得夹带示例数字，避免模型跟着编
      expect(section).not.toMatch(/\d{2,}/)
      expect(chatPrompt).not.toMatch(/播放量[：:]\s*\d/)
      expect(generatePrompt).not.toMatch(/点赞[：:]\s*\d/)
    }
  })

  it("locks the five-section output structure", () => {
    const prompt = buildContentRetroGeneratePrompt({ knowledgeBlock: "企业知识库" })

    expect(prompt).toContain("结果说明")
    expect(prompt).toContain("打中了什么，没打中什么")
    expect(prompt).toContain("这次判断哪里对，哪里错")
    expect(prompt).toContain("下次遇到同类内容该怎么判断")
    expect(prompt).toContain("1-3 条能继续执行的动作")
    expect(prompt).toContain("不是商业模式诊断")
    expect(prompt).toContain("不需要走四层诊断结构")
  })

  it("keeps content retro out of four-layer diagnosis framing", () => {
    const chatPrompt = buildContentRetroChatPrompt({
      contextBlock: "企业知识库",
      publishOutcomeBlock: SAMPLE_OUTCOME_BLOCK,
    })
    const generatePrompt = buildContentRetroGeneratePrompt({
      knowledgeBlock: "企业知识库",
      publishOutcomeBlock: SAMPLE_OUTCOME_BLOCK,
    })

    for (const prompt of [chatPrompt, generatePrompt]) {
      expect(prompt).toContain("禁止走商业模式四层诊断结构")
      for (const trace of FOUR_LAYER_DIAGNOSIS_TRACES) {
        // 「四层诊断」只允许出现在禁止说明里，不允许展开四层结构正文
        if (trace === "四层诊断") continue
        expect(prompt).not.toContain(trace)
      }
      expect(prompt).not.toContain("逐层诊断")
      expect(prompt).not.toContain("## 生意系统四层诊断")
    }
  })
})

describe("ContentRetroHandler", () => {
  beforeEach(() => {
    mocks.executeGenerate.mockReset().mockResolvedValue({
      content: "复盘正文",
      model: "test",
      usage: { totalTokens: 0 },
    })
    mocks.save.mockReset().mockResolvedValue({ id: "generation-retro-1", knowledgeUsed: [] })
  })

  it("restricts generate output formats to raw_copy", async () => {
    const context = {
      userId: "test-user",
      agentId: "content_retro",
      targetFormats: ["video_script", "wechat_article", "raw_copy"],
      rawInput: "请复盘这条已发布内容",
      knowledgeBlock: "企业知识库",
      methodologyBlock: "",
      businessDiagnosisBlock: "",
      viralStructureBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      selectedMethodologyBlock: "",
      retrievedEntries: [],
      retrievedSource: "raw",
      knowledgeStrategy: "selective",
      publishOutcomeBlock: SAMPLE_OUTCOME_BLOCK,
    } as unknown as AimGenerateContext

    const result = await new ContentRetroHandler().generate(context)

    expect(result.results.map((item) => item.format)).toEqual(["raw_copy"])
    expect(result.results).toHaveLength(1)
    expect(result.id).toBe("generation-retro-1")

    const [agentId, systemPrompt] = mocks.executeGenerate.mock.calls[0]
    expect(agentId).toBe("content_retro")
    expect(systemPrompt).toContain("播放量：12800")
    expect(systemPrompt).toContain("结果说明")
    expect(systemPrompt).not.toContain("## 生意系统四层诊断")
  })

  it("falls back to raw_copy when no allowed format is requested", async () => {
    const context = {
      userId: "test-user",
      agentId: "content_retro",
      targetFormats: ["video_script", "xiaohongshu_post"],
      rawInput: "请复盘",
      knowledgeBlock: "",
      methodologyBlock: "",
      businessDiagnosisBlock: "",
      viralStructureBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      selectedMethodologyBlock: "",
      retrievedEntries: [],
      retrievedSource: "raw",
      knowledgeStrategy: "selective",
    } as unknown as AimGenerateContext

    const result = await new ContentRetroHandler().generate(context)
    expect(result.results.map((item) => item.format)).toEqual(["raw_copy"])
  })
})
