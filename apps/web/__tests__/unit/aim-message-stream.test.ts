import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AimMessageStream } from "@/components/aim/aim-message-stream"
import { extractAimChoiceGroups } from "@/lib/aim/choice-groups"
import type { AimGenerateResponse } from "@/lib/api/client"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

// 隔离 RunDiagnostics：交付气泡与运行结果动作组件涉及交互态/上下文，与本测试无关，
// 在 renderToStaticMarkup 下打桩为空，避免 SSR 副作用干扰质量行的断言。
vi.mock("@/components/aim/aim-deliverable-bubble", () => ({
  AimDeliverableBubble: () => null,
}))
vi.mock("@/components/aim/aim-run-outcome-select-items", () => ({
  AimRunOutcomeActions: () => null,
}))

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

describe("RunDiagnostics quality status", () => {
  const baseDeliverables: AimGenerateResponse = {
    id: "gen-1",
    results: [{ format: "video_script", content: "测试正文内容", wordCount: 6 }],
    knowledgeUsed: [],
  }

  const renderWithStatus = (qualityStatus: AimWorkbenchMessage["qualityStatus"]) =>
    renderToStaticMarkup(createElement(AimMessageStream, {
      messages: [{
        id: "m1",
        role: "assistant",
        content: "ok",
        deliverables: baseDeliverables,
        runId: "run_test123",
        qualityStatus,
      }],
      busy: false,
      agentIntro: "内容工作台",
      workflowStage: "content",
      selectedAgentId: "content_producer",
      selectedProjectId: "project-1",
      actions,
    }))

  it("skipped → 中性「免质检」+ 执行编号，不再出现刺眼的 skipped / 质量提示", () => {
    const html = renderWithStatus("skipped")
    expect(html).toContain("免质检")
    expect(html).toContain("run_test123")
    expect(html).not.toContain("质量提示")
    expect(html).not.toContain("skipped")
    expect(html).not.toContain("· 质量")
  })

  it("warn → 琥珀色「待优化」", () => {
    const html = renderWithStatus("warn")
    expect(html).toContain("待优化")
    expect(html).toContain("amber-500/10")
  })

  it("fail → 红色「质检未通过」（严重度高于 warn/degraded，不再被灰底弱化）", () => {
    const html = renderWithStatus("fail")
    expect(html).toContain("质检未通过")
    expect(html).toContain("red-500/10")
    expect(html).not.toContain("amber-500/10")
  })

  it("pass（非降级）→ 不渲染质量行", () => {
    const html = renderWithStatus("pass")
    expect(html).not.toContain("执行编号")
    expect(html).not.toContain("免质检")
  })
})
