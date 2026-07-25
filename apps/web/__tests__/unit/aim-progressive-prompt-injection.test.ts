import { describe, expect, it } from "vitest"

import {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_OPERATING_LOGIC_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
  buildContentProducerChatPrompt,
  measureContentProducerPromptFootprint,
} from "@/lib/aim-agent-prompts"

/**
 * 瘦身前 chat 几乎每次全量拼接的长规则块字符合计（冻结基线）。
 * 用于断言 always-on 至少下降 30%。
 */
const LEGACY_ALWAYS_ON_CHARS =
  AIM_HIGH_RISK_LOOP_RULE.length
  + PUBLISH_PACKAGE_CHAT_RULE.length
  + BENCHMARK_REWRITE_GUARDRAIL.length
  + CONTENT_PRODUCER_OPERATING_LOGIC_RULE.length
  // 旧版「对话原则」12–17 条与方法论前言重复段落的近似长度
  + 2200

describe("progressive content producer prompts", () => {
  it("advice/empty chat omits publish-pack and high-risk long blocks", () => {
    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
      rawInput: "这篇有什么问题，怎么优化",
      includePublishPackage: false,
      includeHighRisk: false,
      includeBenchmark: false,
    })

    expect(prompt).not.toContain("发布话题推荐 6 个")
    expect(prompt).not.toContain("高风险任务验证规则")
    expect(prompt).not.toContain("至少 30% 可感知重写")
    expect(prompt).toContain("禁止另写整篇")
    expect(prompt).toContain("不要输出运营分析")
  })

  it("rewrite path includes benchmark guardrail", () => {
    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
      runtimeTask: "rewrite_copy",
      rawInput: "按对标原文改写一篇口播",
      hasBenchmarkText: true,
    })

    expect(prompt).toContain("至少 30% 可感知重写")
    expect(prompt).toContain("不要连续沿用原文 12 个字以上")
  })

  it("publish keywords inject publish-package rule", () => {
    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
      rawInput: "给我整套发布包和发布话题",
    })
    expect(prompt).toContain("发布话题推荐 6 个")
  })

  it("always-on footprint shrinks ≥30% vs legacy concatenated rules", () => {
    const footprint = measureContentProducerPromptFootprint({
      flags: {
        includePublishPackage: false,
        includeHighRisk: false,
        includeBenchmark: false,
        includeOperatingLogicFull: false,
      },
    })
    expect(footprint.progressiveChars).toBe(0)
    expect(footprint.alwaysOnChars).toBeLessThanOrEqual(Math.floor(LEGACY_ALWAYS_ON_CHARS * 0.7))
  })
})
