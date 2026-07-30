import { describe, expect, it } from "vitest"

import { buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import { resolveContentProducerProgressiveFlags } from "@/lib/aim/progressive-prompt-flags"

function baseParams(overrides: {
  runtimeTask?: "light_edit" | "rewrite_copy" | "new_copy" | "positioning_topic" | "quality_review"
  rawInput: string
  hasBenchmarkText?: boolean
}) {
  return {
    knowledgeBlock: "",
    methodologyBlock: "",
    ipWikiBlock: "",
    runtimeTask: overrides.runtimeTask,
    rawInput: overrides.rawInput,
    hasBenchmarkText: overrides.hasBenchmarkText ?? false,
  }
}

const BENCHMARK_RULE_NEEDLE = "至少 30% 可感知重写"
const HIGH_RISK_RULE_NEEDLE = "高风险任务验证规则"

describe("resolveContentProducerProgressiveFlags：light_edit 互斥硬约束", () => {
  it("light_edit 即使原文含「对标/改写」、hasBenchmarkText=true，也不注入 benchmark", () => {
    const flags = resolveContentProducerProgressiveFlags({
      runtimeTask: "light_edit",
      rawInput: "这段对标的标题帮我改写一下开头",
      hasBenchmarkText: true,
    })
    expect(flags.includeBenchmark).toBe(false)
  })

  it("light_edit 即使原文含「天命全案」等正式交付关键词，也不注入 highRisk", () => {
    const flags = resolveContentProducerProgressiveFlags({
      runtimeTask: "light_edit",
      rawInput: "这个天命全案的开头帮我改一下",
    })
    expect(flags.includeHighRisk).toBe(false)
  })

  it("light_edit 的发布包规则仍按原文关键词正常判定（不被误伤）", () => {
    const flags = resolveContentProducerProgressiveFlags({
      runtimeTask: "light_edit",
      rawInput: "给我配一个发布文案",
    })
    expect(flags.includePublishPackage).toBe(true)
    expect(flags.includeBenchmark).toBe(false)
    expect(flags.includeHighRisk).toBe(false)
  })
})

describe("内容创作官提示词：light_edit 不得注入整篇改写类规则", () => {
  it("light_edit 不注入对标改写硬规则", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "light_edit", rawInput: "帮我把开头改得更有冲突感" }),
    )
    expect(prompt).not.toContain(BENCHMARK_RULE_NEEDLE)
  })

  it("light_edit 不注入高风险验证区块", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "light_edit", rawInput: "把结尾的引导语换成提问式" }),
    )
    expect(prompt).not.toContain(HIGH_RISK_RULE_NEEDLE)
  })

  it("light_edit 即使原文带「对标/改写」字样，也不注入对标改写硬规则", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "light_edit", rawInput: "这段对标的标题帮我改写一下开头" }),
    )
    expect(prompt).not.toContain(BENCHMARK_RULE_NEEDLE)
  })

  it("light_edit 即使 hasBenchmarkText=true，也不注入对标改写硬规则", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "light_edit", rawInput: "优化开头这句话", hasBenchmarkText: true }),
    )
    expect(prompt).not.toContain(BENCHMARK_RULE_NEEDLE)
  })
})

describe("内容创作官提示词：对标改写硬规则只在 rewrite / 有对标原文时注入", () => {
  it("rewrite_copy 且有对标原文时注入", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "rewrite_copy", rawInput: "按这篇对标原文帮我整体重写一版", hasBenchmarkText: true }),
    )
    expect(prompt).toContain(BENCHMARK_RULE_NEEDLE)
  })

  it("new_copy 无对标原文时不注入", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "new_copy", rawInput: "帮我写一篇全新的口播" }),
    )
    expect(prompt).not.toContain(BENCHMARK_RULE_NEEDLE)
  })

  it("rewrite_copy 原文含「对标/改写」关键词时仍注入", () => {
    const prompt = buildContentProducerChatPrompt(
      baseParams({ runtimeTask: "rewrite_copy", rawInput: "仿写一篇对标爆款" }),
    )
    expect(prompt).toContain(BENCHMARK_RULE_NEEDLE)
  })
})
