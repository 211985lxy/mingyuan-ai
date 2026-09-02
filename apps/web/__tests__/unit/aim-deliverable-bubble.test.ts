import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AimDeliverableBubble } from "@/components/aim/aim-deliverable-bubble"
import type { AimGenerateResponse } from "@/lib/api/client"

const deliverables: AimGenerateResponse = {
  id: "generation-1",
  results: [{
    format: "video_script",
    content: "[[AIM_METHOD_NOTE]]来自客户访谈[[/AIM_METHOD_NOTE]]\n【旁白】这是当前正文",
    wordCount: 8,
  }],
  knowledgeUsed: [{ id: "knowledge-1", title: "客户访谈", category: "project" }],
  conversationMode: "formal_delivery",
  qualityStatus: "pass",
}

describe("AimDeliverableBubble", () => {
  it("only keeps the body, reasoning, edit and copy actions visible", () => {
    const html = renderToStaticMarkup(createElement(AimDeliverableBubble, {
      messageId: "message-1",
      deliverables,
      isCurrentVersion: true,
      agentId: "content_producer",
      nextActions: [{ id: "publish_package", label: "生成发布包", prompt: "生成发布包" }],
      onRepurpose: vi.fn(),
      onQuality: vi.fn(),
      onMarkStatus: vi.fn(),
      onNextAction: vi.fn(),
      isBusy: false,
      onInlineContentSaved: vi.fn(),
      onInlineSelectionRewrite: vi.fn(),
      onOpenDecision: vi.fn(),
      onOpenPublish: vi.fn(),
      onOpenRetro: vi.fn(),
    }))

    expect(html).toContain("这是当前正文")
    expect(html).toContain("思考依据")
    expect(html).toContain("来自客户访谈")
    expect(html).toContain("编辑")
    expect(html).toContain("复制")
    expect(html).not.toContain("AI 交付物")
    expect(html).not.toContain("当前版本")
    expect(html).not.toContain("生成发布包")
    expect(html).not.toContain("更多")
    expect(html).not.toContain("复制发布包")
    expect(html).not.toContain("导出 Word")
    expect(html).not.toContain("一键创建飞书领取")
    expect(html).not.toContain("复制草稿")
    expect(html).not.toContain("交付依据与衍生工具")
    expect(html).not.toContain("对标仿写")
    expect(html).not.toContain("版本")
  })

  it("keeps safety verification outside the copyable body", () => {
    const html = renderToStaticMarkup(createElement(AimDeliverableBubble, {
      messageId: "message-risk",
      deliverables: {
        id: "generation-risk",
        results: [{
          format: "video_script",
          content: "[[AIM_METHOD_NOTE]]\n⚠ 内容安全提示：客户经营数字待核实\n[[/AIM_METHOD_NOTE]]\n这是可复制的正文。",
          wordCount: 9,
        }],
        knowledgeUsed: [],
      },
      agentId: "content_producer",
      isCurrentVersion: true,
      workflowStage: "content",
      nextActions: [],
      onRepurpose: vi.fn(),
      onQuality: vi.fn(),
      onMarkStatus: vi.fn(),
      onNextAction: vi.fn(),
      isBusy: false,
    }))

    expect(html).toContain("发布前请人工核实")
    expect(html).toContain("不会复制进正文")
    expect(html).toContain("这是可复制的正文")
  })

  it("keeps old deliverable content visible while regenerating", () => {
    const html = renderToStaticMarkup(createElement(AimDeliverableBubble, {
      messageId: "message-1",
      deliverables,
      isCurrentVersion: true,
      agentId: "content_producer",
      nextActions: [{ id: "publish_package", label: "生成发布包", prompt: "生成发布包" }],
      onRepurpose: vi.fn(),
      onQuality: vi.fn(),
      onMarkStatus: vi.fn(),
      isBusy: true,
      regenerating: true,
      onInlineContentSaved: vi.fn(),
      onInlineSelectionRewrite: vi.fn(),
    }))

    expect(html).toContain("这是当前正文")
    expect(html).toContain("正在重出一版")
    expect(html).toContain("opacity-55")
  })

  it("prefers the server-provided reasoningSummary and keeps it out of the body", () => {
    const html = renderToStaticMarkup(createElement(AimDeliverableBubble, {
      messageId: "message-split",
      deliverables: {
        id: "generation-split",
        results: [{
          format: "video_script",
          // 服务端已剥离 METHOD_NOTE：content 只含可发布正文
          content: "这是纯净的发布正文。",
          reasoningSummary: "目标判定：获客；使用资料：客户访谈",
          wordCount: 9,
        }],
        knowledgeUsed: [],
      },
      agentId: "content_producer",
      isCurrentVersion: true,
      nextActions: [],
      onRepurpose: vi.fn(),
      onQuality: vi.fn(),
      onMarkStatus: vi.fn(),
      isBusy: false,
    }))

    // 思考依据进折叠区，正文区保持纯净
    expect(html).toContain("思考依据")
    expect(html).toContain("目标判定：获客")
    expect(html).toContain("这是纯净的发布正文。")
    expect(html).not.toContain("AIM_METHOD_NOTE")
  })
})
