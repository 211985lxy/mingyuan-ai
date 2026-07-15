import { describe, expect, it } from "vitest"
import { parseScriptPolishBody } from "@/lib/aim/services/script-polish"
import {
  buildImitateMessages,
  buildPolishInstructions,
  buildProofreadMessages,
} from "@/lib/aim/services/script-polish-prompts"

describe("script polish service contracts", () => {
  it("normalizes supported request fields and defaults to polish mode", () => {
    expect(parseScriptPolishBody({
      content: "  一段需要润色的文案  ",
      weakDimensions: ["logic"],
      projectId: "project-1",
      styleId: "invalid-style",
      mode: "unknown",
    })).toEqual({
      content: "一段需要润色的文案",
      weakDimensions: ["logic"],
      topicTitle: null,
      persona: null,
      projectId: "project-1",
      viralSourceText: "",
      styleId: undefined,
      mode: "polish",
    })
  })

  it("keeps imitate and proofread prompt boundaries", () => {
    const imitate = buildImitateMessages({
      contextBlock: "项目知识",
      styleOverrideBlock: "指定文风",
      viralSourceText: "对标原文",
      content: "当前草稿",
      topicTitle: "选题方向",
    })
    expect(imitate[0]?.content).toContain("项目知识")
    expect(imitate[0]?.content).toContain("指定文风")
    expect(imitate[1]?.content).toContain("对标原文")
    expect(imitate[1]?.content).toContain("当前草稿")

    const proofread = buildProofreadMessages("待校对文案")
    expect(proofread[0]?.content).toContain("不要扩写")
    expect(proofread[1]?.content).toContain("待校对文案")
  })

  it("uses general polish instructions when no weak dimension is selected", () => {
    expect(buildPolishInstructions([])).toEqual([
      "【综合润色】",
      "优化文案的口语化表达、去除AI味痕迹、增强开头吸引力和逻辑连贯性。",
    ])
  })
})
