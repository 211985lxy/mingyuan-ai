import { describe, expect, it } from "vitest"
import { buildAimDeliveryContract } from "@/lib/aim-delivery-contract"

describe("buildAimDeliveryContract", () => {
  it("shows the task, grounded evidence, quality and next action", () => {
    const contract = buildAimDeliveryContract({
      conversationMode: "formal_delivery",
      knowledgeCount: 2,
      knowledgeTitles: ["客户定位", "产品资料"],
      knowledgeStrategyLabel: "深度调用",
      qualityStatus: "pass",
      isCurrentVersion: true,
      primaryNextActionLabel: "生成发布包",
    })

    expect(contract.task).toEqual({ label: "正式交付", detail: "当前版本" })
    expect(contract.evidence).toEqual({
      label: "当前需求 + 知识库 2 条",
      detail: "客户定位、产品资料",
    })
    expect(contract.status.tone).toBe("success")
    expect(contract.next.label).toBe("生成发布包")
  })

  it("does not claim that knowledge was used when no entry was retrieved", () => {
    const contract = buildAimDeliveryContract({
      conversationMode: "local_edit",
      knowledgeCount: 0,
      knowledgeStrategyLabel: "轻量编辑",
      qualityStatus: "skipped",
      isCurrentVersion: true,
    })

    expect(contract.evidence.label).toBe("当前需求")
    expect(contract.evidence.detail).toBe("轻量编辑")
    expect(contract.next.label).toBe("确认修改或继续追改")
  })

  it("prioritizes recovery when a run is degraded", () => {
    const contract = buildAimDeliveryContract({
      conversationMode: "formal_delivery",
      knowledgeCount: 1,
      degraded: true,
      qualityStatus: "pass",
      isCurrentVersion: false,
      primaryNextActionLabel: "登记发布",
    })

    expect(contract.status).toEqual({
      label: "降级交付",
      detail: "建议复核后使用",
      tone: "warning",
    })
    expect(contract.next).toEqual({ label: "先检查再使用", detail: "建议返回当前版本" })
  })
})
