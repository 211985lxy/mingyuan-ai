import { describe, expect, it } from "vitest"
import {
  buildEvolutionPrompt,
  normalizeEvolutionMessages,
  parseEvolutionJson,
} from "@/lib/aim-chat-evolution"

describe("aim chat evolution", () => {
  it("parses valid extraction json into user_insight suggestions", () => {
    const parsed = parseEvolutionJson(
      JSON.stringify({
        suggestions: [
          {
            type: "style_preference",
            title: "偏好：短句、少术语",
            content: "用户明确要求文案少用套话，句子更短，更像真人口播。",
            evidence: "用户说：这个太AI了，短一点。",
          },
        ],
      }),
    )

    expect(parsed).toEqual([
      {
        category: "user_insight",
        title: "偏好：短句、少术语",
        content:
          "用户明确要求文案少用套话，句子更短，更像真人口播。\n证据：用户说：这个太AI了，短一点。",
        tags: [
          "kb_scope:project",
          "asset_role:preference",
          "usable_for:video",
          "usable_for:wechat",
          "confidence:user_claim",
        ],
      },
    ])
  })

  it("returns no suggestions for invalid json or empty suggestions", () => {
    expect(parseEvolutionJson("not-json")).toEqual([])
    expect(parseEvolutionJson(JSON.stringify({ suggestions: [] }))).toEqual([])
  })

  it("builds a bounded prompt from recent conversation", () => {
    const prompt = buildEvolutionPrompt([
      { role: "user", content: "我不喜欢那种很装的表达。" },
      { role: "assistant", content: "明白，我会改成更直接的口播。" },
    ])

    expect(prompt).toContain("只提炼长期有用的客户偏好")
    expect(prompt).toContain("我不喜欢那种很装的表达")
    expect(prompt.length).toBeLessThan(5000)
  })

  it("normalizes only user and assistant messages with non-empty content", () => {
    expect(
      normalizeEvolutionMessages([
        { role: "system", content: "ignore" },
        { role: "user", content: "  我喜欢短句  " },
        { role: "assistant", content: "" },
        { role: "assistant", content: "好的" },
        { role: "user", content: 123 },
      ]),
    ).toEqual([
      { role: "user", content: "我喜欢短句" },
      { role: "assistant", content: "好的" },
    ])
  })
})
