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
})
