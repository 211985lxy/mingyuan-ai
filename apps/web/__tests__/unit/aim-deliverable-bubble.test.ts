import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AimDeliverableBubble, DeliveryContractStrip } from "@/components/aim/aim-deliverable-bubble"
import type { AimDeliveryContract } from "@/lib/aim-delivery-contract"
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
  it("keeps the current result, evidence and publishing actions visible", () => {
    const html = renderToStaticMarkup(createElement(AimDeliverableBubble, {
      deliverables,
      isCurrentVersion: true,
      agentId: "content_producer",
      nextActions: [{ id: "publish_package", label: "生成发布包", prompt: "生成发布包" }],
      onRepurpose: vi.fn(),
      onQuality: vi.fn(),
      onMarkStatus: vi.fn(),
      onNextAction: vi.fn(),
      isBusy: false,
      onEditResult: vi.fn(),
      onOpenDecision: vi.fn(),
      onOpenPublish: vi.fn(),
      onOpenRetro: vi.fn(),
    }))

    expect(html).toContain("AI 交付物")
    expect(html).toContain("当前版本")
    expect(html).toContain("当前需求 + 知识库 1 条")
    expect(html).toContain("思考依据")
    expect(html).toContain("来自客户访谈")
    expect(html).toContain("这是当前正文")
    expect(html).toContain("生成发布包")
    expect(html).toContain("发布前判断")
    expect(html).toContain("登记发布")
    expect(html).toContain("填写复盘")
  })
})

describe("DeliveryContractStrip", () => {
  it("shows assumptions and unknowns for an exploratory task", () => {
    const contract: AimDeliveryContract = {
      task: { label: "确认任务", detail: "当前版本" },
      evidence: { label: "当前需求", detail: "未引用知识库资料" },
      status: { label: "待优化", detail: "建议先做自查", tone: "warning" },
      next: { label: "先补资料", detail: "操作当前版本" },
      expanded: true,
      taskSpec: { mode: "discovery_exploration" } as AimDeliveryContract["taskSpec"],
      assumptions: [{ statement: "客户更关注风险", impact: "medium" }],
      unknowns: ["缺少真实案例"],
      knownFacts: [{ statement: "客户位于深圳", source: "用户补充" }],
    }
    const html = renderToStaticMarkup(createElement(DeliveryContractStrip, { contract }))

    expect(html).toContain("当前信息不足")
    expect(html).toContain("客户更关注风险")
    expect(html).toContain("缺少真实案例")
    expect(html).toContain("客户位于深圳")
  })
})
