import { describe, expect, it } from "vitest"

import {
  buildAimEditorContext,
  buildAimRawInput,
  detectAimLarkToolAction,
  extractBenchmarkAnalysisText,
  extractBenchmarkOriginalText,
  extractPersonaProgress,
  findLatestAimDeliverableText,
  findLatestAimVideoDeliverableMessageId,
  getAimOpeningSegment,
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

  it("builds generation input from user turns only", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "第一条素材" },
      { id: "2", role: "assistant" as const, content: "回复" },
      { id: "3", role: "user" as const, content: "第二条素材" },
    ]
    expect(buildAimRawInput(messages, "本次要求")).toBe("第一条素材\n\n第二条素材\n\n本次要求")
  })

  it("routes explicit Lark actions without treating generic mentions as tools", () => {
    expect(detectAimLarkToolAction("同步今天的选题到飞书")).toBe("import_lark_topics")
    expect(detectAimLarkToolAction("把这篇脚本同步到飞书")).toBe("export_lark_generation")
    expect(detectAimLarkToolAction("我今天用了飞书")).toBeNull()
  })

  it("selects the latest video deliverable and its primary text", () => {
    const messages = [
      { id: "old", role: "assistant" as const, content: "", deliverables: { id: "g1", results: [{ format: "raw_copy" as const, content: "旧稿", wordCount: 2 }], knowledgeUsed: [] } },
      { id: "new", role: "assistant" as const, content: "", deliverables: { id: "g2", results: [{ format: "video_script" as const, content: "新稿", wordCount: 2 }], knowledgeUsed: [] } },
    ]
    expect(findLatestAimVideoDeliverableMessageId(messages)).toBe("new")
    expect(findLatestAimDeliverableText(messages)).toBe("新稿")
  })

  it("builds opening and editor selection context", () => {
    expect(getAimOpeningSegment("短标题\n\n第二段\n\n第三段").segment).toBe("短标题\n\n第二段")
    expect(buildAimEditorContext({
      action: "局部改写",
      referenceSelection: " 参考段 ",
      draftSelection: "",
      editorText: " 当前稿 ",
      labels: { documentType: "copy", referenceTitle: "对标", draftTitle: "稿件" },
    })).toMatchObject({ action: "局部改写", referenceSelection: "参考段", draftSelection: undefined, draftText: "当前稿" })
  })
})
