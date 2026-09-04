import { beforeEach, describe, expect, it, vi } from "vitest"

const { updateAimWorkflowStatus, registerAimLeadAttribution, toast } = vi.hoisted(() => ({
  updateAimWorkflowStatus: vi.fn(async () => ({})),
  registerAimLeadAttribution: vi.fn(async () => ({ created: true })),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("sonner", () => ({ toast }))
vi.mock("@/lib/api/client", () => ({ updateAimWorkflowStatus }))
vi.mock("@/lib/api/lead-attribution", () => ({ registerAimLeadAttribution }))

import {
  parseAimOutcomeNumber,
  saveLeadRecord,
  savePublishRecord,
} from "@/hooks/use-aim-workflow-records"

describe("AIM workflow record metrics", () => {
  it("keeps missing and invalid metrics distinct from zero", () => {
    expect(parseAimOutcomeNumber({}, "views")).toBeNull()
    expect(parseAimOutcomeNumber({ views: "not-a-number" }, "views")).toBeNull()
    expect(parseAimOutcomeNumber({ views: "0" }, "views")).toBe(0)
    expect(parseAimOutcomeNumber({ revenue: " 1280.5 " }, "revenue")).toBe(1280.5)
  })
})

describe("WP-A 强制点①：发布登记必须挂作品键", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects publish without 作品链接/作品 ID before any API call", async () => {
    await expect(
      savePublishRecord("gen-1", { publishPlatform: "抖音", publishUrl: "  " }),
    ).rejects.toThrow("请填写作品链接或作品 ID（用于经营归因）")
    expect(updateAimWorkflowStatus).not.toHaveBeenCalled()
  })

  it("registers published with platform and 作品键 after entering ready_to_publish", async () => {
    await savePublishRecord("gen-1", { publishPlatform: " 小红书 ", publishUrl: " https://xhs.link/abc " })

    expect(updateAimWorkflowStatus).toHaveBeenCalledTimes(2)
    expect(updateAimWorkflowStatus.mock.calls[0]).toEqual(["gen-1", { workflowStatus: "ready_to_publish" }])
    expect(updateAimWorkflowStatus.mock.calls[1]).toEqual([
      "gen-1",
      { workflowStatus: "published", publishPlatform: "小红书", publishUrl: "https://xhs.link/abc" },
    ])
  })

  it("still publishes when ready_to_publish step fails（已在更后状态）", async () => {
    updateAimWorkflowStatus.mockRejectedValueOnce(new Error("非法跳转"))

    await savePublishRecord("gen-1", { publishPlatform: "抖音", publishUrl: "dy_123" })

    expect(updateAimWorkflowStatus).toHaveBeenCalledTimes(2)
    expect(updateAimWorkflowStatus.mock.calls[1][1]).toMatchObject({
      workflowStatus: "published",
      publishUrl: "dy_123",
    })
  })
})

describe("WP-B 强制点②：线索登记必须显式挂来源", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects lead without 线索标识 before any API call", async () => {
    await expect(
      saveLeadRecord("gen-1", { externalLeadId: "", externalDealId: "", externalPaymentId: "" }),
    ).rejects.toThrow("请填写线索标识（微信号 / 手机号 / 线索编号）")
    expect(registerAimLeadAttribution).not.toHaveBeenCalled()
  })

  it("registers lead attribution with trimmed ids and omits empty optionals", async () => {
    await saveLeadRecord("gen-1", {
      externalLeadId: " wx_lead_1 ",
      externalDealId: " deal_1 ",
      externalPaymentId: "",
    })

    expect(registerAimLeadAttribution).toHaveBeenCalledWith({
      generationId: "gen-1",
      externalLeadId: "wx_lead_1",
      externalDealId: "deal_1",
      externalPaymentId: undefined,
    })
    expect(toast.success).toHaveBeenCalledWith("已登记线索归因")
  })
})
