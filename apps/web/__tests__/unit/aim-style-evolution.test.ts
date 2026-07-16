import { describe, expect, it } from "vitest"
import {
  buildStyleExtractionPrompt,
  normalizeStyleMessages,
  parseStyleProfileJson,
  STYLE_PROFILE_DEFAULT_TAGS,
} from "@/lib/aim-style-evolution"

describe("aim style evolution", () => {
  it("parses a full 8-dimension delta", () => {
    const parsed = parseStyleProfileJson(
      JSON.stringify({
        cognitivePattern: { entry: "反常识破题", reasoning: "演绎", attitude: "平等对话" },
        emotionalTexture: { tone: "冷静理性", humor: "冷幽默" },
        structuralDna: { hook: "反常识断言", twist: "1/3 处", ending: "留白反问" },
        microLinguistics: { sentence: "短句连击", catchphrase: "说白了", metaphor: "具象生活化" },
        coreValues: { beliefs: "信息密度为王", supports: "说真话", opposes: "正确的废话" },
        decisionHeuristics: { priorities: "先看生意是否成立", tradeoffs: "先验证再扩张" },
        antiPatterns: { avoids: "不编案例", forbiddenTone: "不要导师腔" },
        honestLimits: { uncertainty: "没验证过就明确说不知道", requiresEvidence: "战绩必须有真实数据" },
        evidence: "用户说：别绕，直接说重点。",
        confidence: "confirmed",
      }),
    )

    expect(parsed).not.toBeNull()
    expect(parsed!.cognitivePattern.entry).toBe("反常识破题")
    expect(parsed!.coreValues.opposes).toBe("正确的废话")
    expect(parsed!.decisionHeuristics.priorities).toBe("先看生意是否成立")
    expect(parsed!.antiPatterns.forbiddenTone).toBe("不要导师腔")
    expect(parsed!.honestLimits.requiresEvidence).toBe("战绩必须有真实数据")
    expect(parsed!.confidence).toBe("confirmed")
  })

  it("returns null for empty object (no style worth saving)", () => {
    expect(parseStyleProfileJson("{}")).toBeNull()
  })

  it("returns null for malformed json", () => {
    expect(parseStyleProfileJson("not-json")).toBeNull()
    expect(parseStyleProfileJson("")).toBeNull()
  })

  it("returns null when every dimension is empty", () => {
    expect(
      parseStyleProfileJson(
        JSON.stringify({
          cognitivePattern: {},
          emotionalTexture: {},
          structuralDna: {},
          microLinguistics: {},
          coreValues: {},
          evidence: "",
        }),
      ),
    ).toBeNull()
  })

  it("fills a default evidence when missing", () => {
    const parsed = parseStyleProfileJson(
      JSON.stringify({ coreValues: { beliefs: "信息密度为王" } }),
    )
    expect(parsed).not.toBeNull()
    expect(parsed!.evidence.length).toBeGreaterThan(0)
  })

  it("falls back to user_claim confidence on illegal value", () => {
    const parsed = parseStyleProfileJson(
      JSON.stringify({ coreValues: { beliefs: "x" }, confidence: "bogus" }),
    )
    expect(parsed!.confidence).toBe("user_claim")
  })

  it("normalizes only user/assistant messages with non-empty content", () => {
    expect(
      normalizeStyleMessages([
        { role: "system", content: "ignore" },
        { role: "user", content: "  我喜欢短句  " },
        { role: "assistant", content: "" },
        { role: "assistant", content: "好的" },
      ]),
    ).toEqual([
      { role: "user", content: "我喜欢短句" },
      { role: "assistant", content: "好的" },
    ])
  })

  it("builds a prompt covering the 8 style dimensions", () => {
    const prompt = buildStyleExtractionPrompt([
      { role: "user", content: "别用那些黑话。" },
      { role: "assistant", content: "明白。" },
    ])
    expect(prompt).toContain("cognitivePattern")
    expect(prompt).toContain("emotionalTexture")
    expect(prompt).toContain("structuralDna")
    expect(prompt).toContain("microLinguistics")
    expect(prompt).toContain("coreValues")
    expect(prompt).toContain("decisionHeuristics")
    expect(prompt).toContain("antiPatterns")
    expect(prompt).toContain("honestLimits")
    expect(prompt).toContain("第一性原理")
    expect(prompt).toContain("别用那些黑话")
    expect(prompt.length).toBeLessThan(6000)
  })

  it("uses a legal asset_role (does not repeat the preference bug)", () => {
    expect(STYLE_PROFILE_DEFAULT_TAGS).toContain("asset_role:judgment")
    expect(STYLE_PROFILE_DEFAULT_TAGS).toContain("kb_scope:ip")
    expect(STYLE_PROFILE_DEFAULT_TAGS).not.toContain("asset_role:preference")
  })
})
