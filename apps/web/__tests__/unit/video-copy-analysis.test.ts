import { describe, expect, it } from "vitest"

import {
  analyzeVideoCopy,
  buildVideoCopyAnalysisMessages,
  buildFallbackVideoCopyAnalysis,
  parseVideoCopyAnalysis,
  type VideoCopyAnalysis,
} from "@/lib/video-copy-analysis"
import { parseVideoCopyAnalysisDisplay } from "@/lib/video-copy-display"
import type { LLMProvider } from "@/lib/llm"

function provider(content: string): LLMProvider {
  return {
    name: "test",
    isAvailable: () => true,
    complete: async () => ({
      content,
      model: "test-model",
      provider: "test",
    }),
  }
}

describe("video copy analysis", () => {
  it("builds a grounded prompt from video metadata and transcript", () => {
    const messages = buildVideoCopyAnalysisMessages({
      title: "视频标题",
      platform: "bilibili",
      videoDuration: "00:48",
      transcript: "这是视频文案。",
    })

    expect(messages[0].content).toContain("纯 Markdown")
    expect(messages[0].content).toContain("结构拆解是重点")
    expect(messages[0].content).toContain("每 12 秒左右输出一个 ### 节点")
    expect(messages[0].content).toContain("不设置 6-8 个节点上限")
    expect(messages[0].content).toContain("时间段 + 结构动作")
    expect(messages[0].content).toContain("每个枚举点都要单独成节点")
    expect(messages[0].content).toContain("每个结构子节点只保留两项")
    expect(messages[0].content).toContain("文案动作 / 用户心理 / 商业意图 / 可复用模板")
    expect(messages[0].content).toContain("不要只写\"制造好奇\"、\"建立信任\"这种空话")
    expect(messages[0].content).toContain("核心选题、开头机制、观点冲突和情绪触发点")
    expect(messages[0].content).toContain("完成爆款选题再创作")
    expect(messages[0].content).toContain("可借什么、必须重构什么、原创风险是什么")
    expect(messages[0].content).toContain("禁止输出\"心理作用：\"、\"迁移保留点：\"")
    expect(messages[0].content).toContain("不要使用 ** 星号加粗")
    expect(messages[1].content).toContain("视频标题")
    expect(messages[1].content).toContain("bilibili")
    expect(messages[1].content).toContain("00:48")
    expect(messages[1].content).toContain("这是视频文案。")
  })

  it("parses a markdown analysis result directly", () => {
    const md = [
      "## 结构拆解",
      "",
      "### 开头",
      "用强冲突开头",
      "",
      "### 正文",
      "提出问题 → 解释原因",
      "",
      "## 心理拆解",
      "",
      "从焦虑到解决",
      "",
      "## 商业拆解",
      "",
      "引导评论转化",
      "",
      "## 迁移应用",
      "",
      "先指出问题，再给方案",
    ].join("\n")

    const analysis = parseVideoCopyAnalysis(md) satisfies VideoCopyAnalysis
    expect(analysis.markdown).toContain("用强冲突开头")
    expect(analysis.markdown).toContain("先指出问题，再给方案")
    expect(analysis.markdown).toContain("## 结构拆解")
  })

  it("strips bold stars and removes extra field labels from model output", () => {
    const md = [
      "## 结构拆解",
      "### 正文-1：方法一",
      "**原文片段**：第一段。",
      "**结构作用**：承接判断。",
      "**心理作用**：制造好奇。",
      "**迁移保留点**：保留结构。",
      "## 心理拆解",
      "制造期待。",
    ].join("\n")

    const analysis = parseVideoCopyAnalysis(md)

    expect(analysis.markdown).toContain("原文片段：第一段。")
    expect(analysis.markdown).toContain("结构作用：承接判断。")
    expect(analysis.markdown).toContain("### 方法一")
    expect(analysis.markdown).not.toContain("正文-1")
    expect(analysis.markdown).not.toContain("心理作用：")
    expect(analysis.markdown).not.toContain("迁移保留点：")
    expect(analysis.markdown).not.toContain("**")
  })

  it("parses analysis markdown into display cards", () => {
    const display = parseVideoCopyAnalysisDisplay([
      "## 结构拆解",
      "### 正文-1：开头冲突",
      "原文片段：我深度使用 code 有两个多月了。",
      "现在有一个特别强烈的感受。",
      "结构作用：用个人体验建立可信度。",
      "同时制造继续看下去的理由。",
      "心理作用：制造好奇。",
      "迁移保留点：保留开头。",
      "## 商业拆解",
      "适合引导关注。",
    ].join("\n"))

    expect(display.nodes).toEqual([
      {
        title: "开头冲突",
        original: "我深度使用 code 有两个多月了。\n现在有一个特别强烈的感受。",
        structureEffect: "用个人体验建立可信度。\n同时制造继续看下去的理由。",
      },
    ])
    expect(display.supplementalMarkdown).toContain("## 商业拆解")
    expect(display.supplementalMarkdown).not.toContain("心理作用")
    expect(display.supplementalMarkdown).not.toContain("迁移保留点")
  })

  it("runs analysis through an injected LLM provider", async () => {
    const md = [
      "## 结构拆解",
      "",
      "开门见山，痛点到行动",
      "",
      "## 心理拆解",
      "",
      "对比制造认知冲突",
      "",
      "## 商业拆解",
      "",
      "适合关注账号",
      "",
      "## 迁移应用",
      "",
      "痛点 + 案例 + 行动",
    ].join("\n")

    const analysis = await analyzeVideoCopy(
      {
        title: "标题",
        platform: "douyin",
        transcript: "原始文案",
      },
      provider(md)
    )

    expect(analysis.markdown).toContain("开门见山")
    expect(analysis.markdown).toContain("## 结构拆解")
    expect(analysis.markdown).toContain("## 迁移应用")
  })

  it("falls back when the model output is too short", async () => {
    const analysis = await analyzeVideoCopy(
      {
        title: "标题",
        platform: "douyin",
        transcript: "第一句。第二句。第三句。第四句。第五句。",
      },
      provider("?")
    )

    expect(analysis.markdown).toContain("## 结构拆解")
    expect(analysis.markdown).toContain("第一句。")
  })

  it("builds a fallback analysis from transcript text", () => {
    const analysis = buildFallbackVideoCopyAnalysis({
      transcript: "第一句。第二句。第三句。第四句。第五句。",
    })

    expect(analysis.markdown).toContain("## 结构拆解")
    expect(analysis.markdown).toContain("第一句。")
    expect(analysis.markdown).toContain("## 心理拆解")
    expect(analysis.markdown).toContain("## 商业拆解")
    expect(analysis.markdown).toContain("## 迁移应用")
    expect(analysis.markdown).toContain("### 再创作建议")
    expect(analysis.markdown).toContain("约0-12秒")
    expect(analysis.markdown).toContain("约12-24秒")
    expect(analysis.markdown).toContain("结尾收束")
    expect(analysis.markdown).not.toContain("正文-1")
    expect(analysis.markdown).toContain("必须重构")
    expect(analysis.markdown).toContain("原创风险")
  })

  it("fallback splits three-method body structures into separate nodes", () => {
    const analysis = buildFallbackVideoCopyAnalysis({
      transcript: [
        "开头先制造冲突。",
        "第一个狩猎法，带着问题进去找答案。",
        "第二，反推法，让AI审问你。",
        "第三招，辩论法，让不同观点打一架。",
        "最后做价值升华。",
      ].join(""),
    })

    expect(analysis.markdown).toContain("约0-12秒：开头钩子")
    expect(analysis.markdown).toContain("约12-24秒：第一个狩猎法")
    expect(analysis.markdown).toContain("约24-36秒：第二，反推法")
    expect(analysis.markdown).toContain("约36-48秒：第三招，辩论法")
    expect(analysis.markdown).not.toContain("正文-1")
    expect(analysis.markdown).toContain("原文片段")
    expect(analysis.markdown).toContain("结构作用")
    expect(analysis.markdown).toContain("可复用模板")
    expect(analysis.markdown).not.toContain("迁移保留点")
  })
})
