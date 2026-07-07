import { beforeEach, describe, expect, it, vi } from "vitest"

const mockComplete = vi.fn()
const mockDetectAITaste = vi.fn()

vi.mock("@/lib/llm/client", () => ({
  LLMClient: {
    shared: () => ({ complete: mockComplete }),
    reset: vi.fn(),
  },
}))

vi.mock("@/lib/ai-taste-detector", () => ({
  detectAITaste: (...args: unknown[]) => mockDetectAITaste(...(args as [])),
}))

const { runQualityCheck, runQualityGateWithRewrite } = await import("@/lib/quality-gate")

const sampleInput = {
  content: "这是一个测试文案，用于验证质量门控逻辑。",
  topicTitle: "测试选题",
  openingType: "反差开头",
  structure: "对比结构",
  endingType: "行动号召",
  persona: {
    roleType: "专家",
    oneLiner: "擅长将复杂问题拆解成实用技巧",
    toneOfVoice: "接地气、真实、有底气",
  },
}

describe("quality-gate", () => {
  beforeEach(() => {
    mockComplete.mockReset()
    mockDetectAITaste.mockReset()
  })

  it("returns a valid quality report for normal scoring", async () => {
    mockDetectAITaste.mockReturnValue({
      score: 9,
      forbiddenWordHits: [],
      patternHits: [],
      suggestions: ["AI 味检测通过"],
    })

    mockComplete.mockResolvedValueOnce({
      content: JSON.stringify({
        editorial: { score: 8, feedback: "编辑质量良好", details: "结构清晰" },
        attraction: { score: 9, feedback: "吸引力强", details: "钩子明显" },
        logic: { score: 8, feedback: "逻辑一致", details: "论点与论据匹配" }
      })
    })

    const report = await runQualityCheck(sampleInput)

    expect(report.editorial.score).toBe(8)
    expect(report.editorial.passed).toBe(true)
    expect(report.aiTaste.score).toBe(9)
    expect(report.attraction.score).toBe(9)
    expect(report.logic.score).toBe(8)
    expect(report.overall.passed).toBe(true)
    expect(report.rewriteCount).toBe(0)
    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(mockComplete.mock.calls[0][0].messages[1].content).toContain(
      "语气：接地气、真实、有底气"
    )
  })

  it("rewrites content until quality gates pass and returns rewrite count", async () => {
    mockDetectAITaste.mockReturnValue({
      score: 10,
      forbiddenWordHits: [],
      patternHits: [],
      suggestions: ["AI 味检测通过"],
    })

    mockComplete
      // initial quality check: editorial fail, attraction/pass, logic/pass
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 5, feedback: "编辑质量不够", details: "开头薄弱" },
          attraction: { score: 8, feedback: "吸引力尚可", details: "钩子存在" },
          logic: { score: 8, feedback: "逻辑良好", details: "结构一致" }
        })
      })
      // rewrite generation
      .mockResolvedValueOnce({ content: "这是改写后的文案内容，增强了钩子和逻辑。" })
      // second quality check after rewrite
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "节奏稳定" },
          attraction: { score: 9, feedback: "吸引力强", details: "钩子鲜明" },
          logic: { score: 8, feedback: "逻辑一致", details: "论证充分" }
        })
      })

    const result = await runQualityGateWithRewrite(sampleInput)

    expect(result.content).toBe("这是改写后的文案内容，增强了钩子和逻辑。")
    expect(result.report.overall.passed).toBe(true)
    expect(result.report.rewriteCount).toBe(1)
    expect(mockComplete).toHaveBeenCalledTimes(3)
  })

  it("targets attraction dimension when attraction score is below pass score", async () => {
    mockDetectAITaste.mockReturnValue({
      score: 10,
      forbiddenWordHits: [],
      patternHits: [],
      suggestions: ["AI 味检测通过"],
    })

    mockComplete
      // 初始打分：attraction 失败 (5分)，而其他均通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 5, feedback: "开头抓人度不够", details: "前3秒缺乏张力" },
          logic: { score: 8, feedback: "逻辑一致", details: "" }
        })
      })
      // 改写
      .mockResolvedValueOnce({ content: "改写后的吸引力强钩子文案。" })
      // 改写后二检：全部通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 8, feedback: "逻辑一致", details: "" }
        })
      })

    const result = await runQualityGateWithRewrite(sampleInput)

    expect(result.content).toBe("改写后的吸引力强钩子文案。")
    expect(result.report.overall.passed).toBe(true)
    expect(result.report.rewriteCount).toBe(1)
    expect(mockComplete).toHaveBeenCalledTimes(3)
    
    // 验证第二次调用时，user message 中传给 LLM 的是 HOOK_REWRITE_PROMPT
    const rewriteCall = mockComplete.mock.calls[1][0]
    expect(rewriteCall.messages[1].content).toContain("【靶向开头重构】")
    expect(rewriteCall.messages[1].content).toContain("【要求的开头类型】：反差开头")
    expect(rewriteCall.messages[1].content).toContain("【吸引力缺陷反馈】：开头抓人度不够")
  })

  it("targets aiTaste dimension when aiTaste score is below pass score", async () => {
    // 初始检测：AI 味不及格 (4分)
    mockDetectAITaste.mockReturnValueOnce({
      score: 4,
      forbiddenWordHits: ["赋能", "痛点"],
      patternHits: ["不仅...而且...更..."],
      suggestions: ["检测到 AI 高频词: 赋能、痛点"],
    })
    // 之后改写后的二次检测：AI 味通过 (9分)
    mockDetectAITaste.mockReturnValueOnce({
      score: 9,
      forbiddenWordHits: [],
      patternHits: [],
      suggestions: ["AI 味检测通过"],
    })

    mockComplete
      // 初始打分：其他均通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 8, feedback: "逻辑一致", details: "" }
        })
      })
      // 改写
      .mockResolvedValueOnce({ content: "改写后非常口语化大白话的文案。" })
      // 改写后二检：全部通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 8, feedback: "逻辑一致", details: "" }
        })
      })

    const result = await runQualityGateWithRewrite(sampleInput)

    expect(result.content).toBe("改写后非常口语化大白话的文案。")
    expect(result.report.overall.passed).toBe(true)
    expect(result.report.rewriteCount).toBe(1)

    // 验证第二次调用时，user message 中传给 LLM 的是 ORAL_REWRITE_PROMPT
    const rewriteCall = mockComplete.mock.calls[1][0]
    expect(rewriteCall.messages[1].content).toContain("【靶向口语去油精修】")
    expect(rewriteCall.messages[1].content).toContain("【命中的 AI 特征】：禁词命中: 2 个，句式命中: 1 个")
    expect(rewriteCall.messages[1].content).toContain("【口语化改进建议】：检测到 AI 高频词: 赋能、痛点")
  })

  it("targets logic dimension when logic score is below pass score", async () => {
    mockDetectAITaste.mockReturnValue({
      score: 10,
      forbiddenWordHits: [],
      patternHits: [],
      suggestions: ["AI 味检测通过"],
    })

    mockComplete
      // 初始打分：logic 失败 (5分)，而其他均通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 5, feedback: "论证结构比较松散", details: "论点与论据偏离" }
        })
      })
      // 改写
      .mockResolvedValueOnce({ content: "改写后的逻辑严密论证文案。" })
      // 改写后二检：全部通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 8, feedback: "逻辑严密一致", details: "" }
        })
      })

    const result = await runQualityGateWithRewrite(sampleInput)

    expect(result.content).toBe("改写后的逻辑严密论证文案。")
    expect(result.report.overall.passed).toBe(true)
    expect(result.report.rewriteCount).toBe(1)
    expect(mockComplete).toHaveBeenCalledTimes(3)

    // 验证第二次调用时，user message 中传给 LLM 的是 LOGIC_REWRITE_PROMPT
    const rewriteCall = mockComplete.mock.calls[1][0]
    expect(rewriteCall.messages[1].content).toContain("【靶向逻辑链重构】")
    expect(rewriteCall.messages[1].content).toContain("【期望的叙事结构】：对比结构")
    expect(rewriteCall.messages[1].content).toContain("【逻辑缺陷反馈】：论证结构比较松散")
  })

  it("targets editorial dimension when editorial score is below pass score", async () => {
    mockDetectAITaste.mockReturnValue({
      score: 10,
      forbiddenWordHits: [],
      patternHits: [],
      suggestions: ["AI 味检测通过"],
    })

    mockComplete
      // 初始打分：editorial 失败 (5分)，而其他均通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 5, feedback: "口播语气不太契合人设", details: "句式过于书面" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 8, feedback: "逻辑一致", details: "" }
        })
      })
      // 改写
      .mockResolvedValueOnce({ content: "改写后的高编辑质量、契合IP口吻文案。" })
      // 改写后二检：全部通过
      .mockResolvedValueOnce({
        content: JSON.stringify({
          editorial: { score: 8, feedback: "编辑质量优秀", details: "" },
          attraction: { score: 8, feedback: "吸引力合格", details: "" },
          logic: { score: 8, feedback: "逻辑一致", details: "" }
        })
      })

    const result = await runQualityGateWithRewrite(sampleInput)

    expect(result.content).toBe("改写后的高编辑质量、契合IP口吻文案。")
    expect(result.report.overall.passed).toBe(true)
    expect(result.report.rewriteCount).toBe(1)
    expect(mockComplete).toHaveBeenCalledTimes(3)

    // 验证第二次调用时，user message 中传给 LLM 的是 EDITORIAL_REWRITE_PROMPT
    const rewriteCall = mockComplete.mock.calls[1][0]
    expect(rewriteCall.messages[1].content).toContain("【靶向编辑质量精修】")
    expect(rewriteCall.messages[1].content).toContain("【期望的 IP 人设与语气】：专家，擅长将复杂问题拆解成实用技巧，语气：接地气、真实、有底气")
    expect(rewriteCall.messages[1].content).toContain("【编辑缺陷反馈】：口播语气不太契合人设")
  })
})

