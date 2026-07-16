import { describe, expect, it } from "vitest"

import {
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  extractPersonaProgress,
  prepareAimChatTurn,
} from "@/lib/aim/workbench-helpers"

describe("AIM workbench helpers", () => {
  it("extracts and clamps persona progress", () => {
    expect(extractPersonaProgress("【进度 65%】")).toBe(65)
    expect(extractPersonaProgress("【进度 120%】")).toBe(100)
    expect(extractPersonaProgress("暂无进度")).toBeNull()
  })

  it("keeps benchmark source separate from later analysis", () => {
    const input = "对标原文：\n第一段\n第二段\n已有拆解：\n1. 钩子"
    expect(extractBenchmarkOriginalText(input)).toBe("第一段\n第二段")
    expect(extractBenchmarkAnalysisText(input)).toBe("1. 钩子")
  })

  it("recognizes a numbered structure block", () => {
    expect(extractBenchmarkAnalysisText("前置说明\n1. 开头\n内容：先给结论")).toBe("1. 开头\n内容：先给结论")
  })

  it("does not append another user message when retrying", () => {
    const messages = [
      { id: "user-1", role: "user" as const, content: "原问题" },
      { id: "failed-1", role: "assistant" as const, content: "对话失败" },
    ]
    const turn = prepareAimChatTurn({
      messages,
      text: "原问题",
      images: [],
      retryMessageId: "failed-1",
      startsNewTask: false,
    })

    expect(turn.thread).toEqual([messages[0]])
    expect(turn.pendingMessages.at(-1)?.content).toContain("正在思考")
  })
})
