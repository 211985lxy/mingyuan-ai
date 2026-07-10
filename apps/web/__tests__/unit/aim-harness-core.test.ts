/**
 * Aim Thin Harness v1 — core unit tests (no model, no DB).
 *
 * Locks the deterministic contracts before any entrypoint is wired:
 *   - planner resolves runtime task / knowledge strategy correctly
 *   - fallback policy classifies retryable vs non-retryable errors
 *   - prompt/context hashing is stable
 *   - deterministic validators catch empty / banned / AI-taste
 */
import { describe, expect, it } from "vitest"

import { planAimRun } from "@/lib/aim-harness/planner"
import {
  hashPrompt,
  hashContextManifest,
} from "@/lib/aim-harness/hashing"
import { validateFormat, deriveQualityStatus } from "@/lib/aim-harness/validators"
import { classifyProviderError } from "@/lib/llm/telemetry"

describe("aim-harness planner", () => {
  it("resolves new_copy + deep for a write_script request", () => {
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "content_producer",
      rawInput: "帮我围绕护肤写一条短视频脚本",
      targetFormats: ["video_script"],
      taskType: "write_script",
    })
    expect(spec.runtimeTask).toBe("new_copy")
    expect(spec.knowledgeStrategy).toBe("deep")
    expect(spec.outputFormats).toEqual(["video_script"])
    expect(spec.entrypoint).toBe("generate")
  })

  it("resolves light_edit for a polish instruction", () => {
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "content_producer",
      rawInput: "原始脚本略",
      targetFormats: ["video_script"],
      polishInstruction: "润色得更口语化",
    })
    expect(spec.runtimeTask).toBe("light_edit")
    expect(spec.knowledgeStrategy).toBe("light_edit")
    expect(spec.contextPolicy.loadKnowledge).toBe(false)
  })

  it("forces positioning_topic for business_diagnosis regardless of wording", () => {
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "business_diagnosis",
      rawInput: "优化这个定位方案的开头钩子",
      targetFormats: ["wechat_article"],
    })
    expect(spec.runtimeTask).toBe("positioning_topic")
  })

  it("resolves hot_topic when a hotTopic is present (priority over topicType)", () => {
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "deep_copywriter",
      rawInput: "结合当下热点写一篇流量型文案",
      targetFormats: ["wechat_article"],
      taskType: "write_script",
      topicType: "流量型",
      hotTopic: "搭子文化",
    })
    expect(spec.knowledgeStrategy).toBe("hot_topic")
  })
})

describe("aim-harness fallback policy", () => {
  it("treats 429 / 5xx / timeout / network as retryable", () => {
    expect(classifyProviderError(new Error("Request failed with status 429")).retryable).toBe(true)
    expect(classifyProviderError(new Error("status 503")).retryable).toBe(true)
    expect(classifyProviderError(new Error("Request timed out")).retryable).toBe(true)
    expect(classifyProviderError(new Error("fetch failed: ECONNREFUSED")).retryable).toBe(true)
  })

  it("fails immediately on 400 / 401 / 403 / config errors", () => {
    expect(classifyProviderError(new Error("status 400 bad request")).retryable).toBe(false)
    expect(classifyProviderError(new Error("401 Unauthorized")).retryable).toBe(false)
    expect(classifyProviderError(new Error("403 Forbidden")).retryable).toBe(false)
    expect(classifyProviderError(new Error("No providers configured, missing API_KEY")).retryable).toBe(false)
  })
})

describe("aim-harness hashing", () => {
  it("prompt hash is stable and trims trailing whitespace", () => {
    const a = hashPrompt("system\n\nuser prompt   ")
    const b = hashPrompt("system\n\nuser prompt")
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it("context manifest hash is order-independent and updatedAt-sensitive", () => {
    const sourcesA = [
      { kind: "knowledge" as const, id: "k1", charCount: 100, updatedAt: "2026-01-01" },
      { kind: "ip_wiki" as const, id: "w1", charCount: 50 },
    ]
    const sourcesB = [...sourcesA].reverse()
    expect(hashContextManifest(sourcesA)).toBe(hashContextManifest(sourcesB))

    const sourcesChanged = [
      { kind: "knowledge" as const, id: "k1", charCount: 100, updatedAt: "2026-02-01" },
    ]
    expect(hashContextManifest(sourcesChanged)).not.toBe(
      hashContextManifest([{ kind: "knowledge", id: "k1", charCount: 100, updatedAt: "2026-01-01" }])
    )
  })
})

describe("aim-harness deterministic validators", () => {
  it("fails on empty content", () => {
    const result = validateFormat({ format: "video_script", content: "   " })
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === "non_empty")?.passed).toBe(false)
  })

  it("fails on banned AI self-disclosure", () => {
    const result = validateFormat({
      format: "video_script",
      content: "我是一个AI助手，今天聊聊护肤。",
      bannedSubstrings: [],
    })
    expect(result.checks.find((c) => c.name === "no_banned_words")?.passed).toBe(false)
    expect(result.passed).toBe(false)
  })

  it("passes clean prose above min length", () => {
    const result = validateFormat({
      format: "video_script",
      content: "今天分享三个新手化妆的小技巧，让你的妆更服帖。",
      minChars: 10,
    })
    expect(result.passed).toBe(true)
  })

  it("derives quality status from deterministic + LLM reports", () => {
    const passing = validateFormat({
      format: "video_script",
      content: "今天分享三个新手化妆的小技巧，让你的妆更服帖更自然。",
      minChars: 10,
    })
    expect(deriveQualityStatus({ deterministic: [passing], llmOverallPassed: true, llmRan: true })).toBe("pass")
    expect(deriveQualityStatus({ deterministic: [passing], llmOverallPassed: false, llmRan: true })).toBe("warn")
    expect(deriveQualityStatus({ deterministic: [passing], llmRan: false })).toBe("skipped")
    const failing = validateFormat({ format: "video_script", content: "" })
    expect(deriveQualityStatus({ deterministic: [failing] })).toBe("fail")
  })
})
