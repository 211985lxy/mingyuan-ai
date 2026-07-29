import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { WorkflowBriefForm } from "@/components/aim/workflow-brief-dialog"
import { WorkflowRecordFields, getWorkflowRecordDialogCopy } from "@/components/aim/workflow-record-dialog"

describe("AIM workflow dialogs", () => {
  it("renders the editable brief fields and confirmation action", () => {
    const html = renderToStaticMarkup(createElement(WorkflowBriefForm, {
      form: { goal: "建立信任", targetCustomer: "制造业老板" },
      busy: false,
      onChange: vi.fn(),
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }))

    expect(html).toContain("建立信任")
    expect(html).toContain("制造业老板")
    expect(html).toContain("进入内容创作")
  })

  it("renders the publishing record fields for the selected mode", () => {
    const html = renderToStaticMarkup(createElement(WorkflowRecordFields, {
      dialog: { mode: "publish", generationId: "generation-1" },
      decisionForm: { summary: "" },
      publishForm: { publishPlatform: "视频号", publishUrl: "https://example.com/post" },
      retroForm: { summary: "" },
      ruleForm: { rule: "" },
      outcomeForm: {},
      outcomeWindow: "7",
      onDecisionChange: vi.fn(),
      onPublishChange: vi.fn(),
      onRetroChange: vi.fn(),
      onRuleChange: vi.fn(),
      onOutcomeChange: vi.fn(),
      onOutcomeWindowChange: vi.fn(),
    }))

    expect(getWorkflowRecordDialogCopy("publish").title).toBe("登记发布")
    expect(html).toContain("视频号")
    expect(html).toContain("https://example.com/post")
    expect(html).not.toContain("这次结果怎么判断")
  })

  it("renders structured verdict code and note fields for retrospectives", () => {
    const html = renderToStaticMarkup(createElement(WorkflowRecordFields, {
      dialog: { mode: "retro", generationId: "generation-1" },
      decisionForm: { summary: "" },
      publishForm: { publishPlatform: "抖音", publishUrl: "" },
      retroForm: { summary: "本周复盘" },
      ruleForm: { rule: "" },
      outcomeForm: { verdictCode: "ineffective", verdictNote: "客户不匹配" },
      outcomeWindow: "7",
      onDecisionChange: vi.fn(),
      onPublishChange: vi.fn(),
      onRetroChange: vi.fn(),
      onRuleChange: vi.fn(),
      onOutcomeChange: vi.fn(),
      onOutcomeWindowChange: vi.fn(),
    }))

    expect(html).toContain("结果判断")
    expect(html).toContain("无效")
    expect(html).toContain("判断备注")
    expect(html).toContain("客户不匹配")
  })
})
