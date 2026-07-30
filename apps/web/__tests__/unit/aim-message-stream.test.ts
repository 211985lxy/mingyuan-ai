import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AimMessageStream } from "@/components/aim/aim-message-stream"
import { extractAimChoiceGroups } from "@/lib/aim/choice-groups"

const actions = {
  onSubmitChoice: vi.fn(),
  onRetry: vi.fn(),
  onApplyReplacement: vi.fn(),
  onRepurpose: vi.fn(() => vi.fn()),
  onQuality: vi.fn(() => vi.fn()),
  onMarkStatus: vi.fn(() => vi.fn()),
  onFinalDisposition: vi.fn(() => vi.fn()),
  onNextAction: vi.fn(),
  onOpenRecord: vi.fn(),
  onCompileToWiki: vi.fn(),
  onInlineContentSaved: vi.fn(),
  onInlineSelectionRewrite: vi.fn(),
}

describe("AIM message stream", () => {
  it("renders intro only when the conversation is empty", () => {
    const html = renderToStaticMarkup(createElement(AimMessageStream, {
      messages: [],
      busy: false,
      agentIntro: "内容工作台",
      workflowStage: "content",
      selectedAgentId: "content_producer",
      selectedProjectId: "",
      actions,
    }))

    expect(html).toContain("内容工作台")
    expect(html).not.toContain("新写一版")
    expect(html).not.toContain("修改当前稿")
  })

  it("keeps method notes, assistant output and choices visible", () => {
    const content = "[[AIM_METHOD_NOTE]]来自项目资料[[/AIM_METHOD_NOTE]]\n请选择方向\nA. 做客户案例\nB. 做观点判断"
    const html = renderToStaticMarkup(createElement(AimMessageStream, {
      messages: [{ id: "message-1", role: "assistant", content }],
      busy: false,
      agentIntro: "内容工作台",
      workflowStage: "content",
      selectedAgentId: "content_producer",
      selectedProjectId: "project-1",
      actions,
    }))

    expect(html).toContain("思考依据")
    expect(html).toContain("来自项目资料")
    expect(html).toContain("请选择方向")
    expect(html).toContain("做客户案例")
    expect(html).toContain("做观点判断")
  })
})

describe("extractAimChoiceGroups", () => {
  it("extracts adjacent A-D options under their question", () => {
    expect(extractAimChoiceGroups("你更想先做什么？\nA. 新写一版\nB. 修改当前稿")).toEqual([{
      question: "你更想先做什么？",
      options: [
        { label: "A", text: "新写一版" },
        { label: "B", text: "修改当前稿" },
      ],
    }])
  })

  it("ignores a single option and oversized option text", () => {
    expect(extractAimChoiceGroups(`请选择\nA. 只有一个`)).toEqual([])
    expect(extractAimChoiceGroups(`请选择\nA. ${"很长".repeat(70)}\nB. 正常选项`)).toEqual([])
  })
})
