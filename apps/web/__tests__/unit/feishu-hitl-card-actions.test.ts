import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 飞书 HITL 审批卡片回调路由单测：
 * - url_verification 挑战回显
 * - bot token 校验（未知 bot 404）
 * - 批准/驳回按卡片 value 结算；幂等冲突返回错误 toast
 */

const mocks = vi.hoisted(() => ({
  resolveBot: vi.fn(),
  settle: vi.fn(),
}))

vi.mock("@/lib/feishu-agent-registry", () => ({
  resolveBotByVerificationToken: (...args: unknown[]) => mocks.resolveBot(...(args as [])),
}))

vi.mock("@/lib/aim/hitl-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aim/hitl-gate")>()
  return {
    ...actual,
    settleHitlApprovalForCard: (...args: unknown[]) => mocks.settle(...(args as [])),
  }
})

vi.mock("@/lib/aim/approval-decision-prisma", () => ({
  createPrismaApprovalDecisionStore: vi.fn(() => ({})),
}))

const { POST } = await import("@/app/api/integrations/feishu/hitl-card-actions/route")

function cardRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/integrations/feishu/hitl-card-actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  token: "tok-1",
  open_id: "ou_feishu_1",
  open_message_id: "om_1",
  action: {
    value: {
      hitl_action: "approve",
      hitl_request_id: "hitl:u1:export_lark_generation:p1:gen-1",
    },
  },
}

describe("飞书 HITL 审批卡片回调", () => {
  beforeEach(() => {
    mocks.resolveBot.mockReset()
    mocks.settle.mockReset()
  })

  it("url_verification 挑战原样回显", async () => {
    const response = await POST(cardRequest({ type: "url_verification", challenge: "ch-1" }))
    const payload = await response.json()
    expect(payload.challenge).toBe("ch-1")
  })

  it("未知 bot 返回 404", async () => {
    mocks.resolveBot.mockReturnValue(null)
    const response = await POST(cardRequest(VALID_BODY))
    expect(response.status).toBe(404)
  })

  it("批准：按卡片 value 结算并返回成功 toast", async () => {
    mocks.resolveBot.mockReturnValue({ id: "bot-1" })
    mocks.settle.mockResolvedValue({ proceed: true, record: { id: "apd-1" } })

    const response = await POST(cardRequest(VALID_BODY))
    const payload = await response.json()
    expect(payload.toast.type).toBe("success")
    expect(payload.approvalId).toBe("apd-1")
    expect(mocks.settle).toHaveBeenCalledWith(
      {
        requestId: "hitl:u1:export_lark_generation:p1:gen-1",
        reviewerId: "ou_feishu_1",
        decision: "approve",
      },
      expect.anything(),
    )
  })

  it("幂等冲突返回错误 toast（同审批人翻转决策）", async () => {
    mocks.resolveBot.mockReturnValue({ id: "bot-1" })
    mocks.settle.mockRejectedValue(
      Object.assign(new Error("requestId 已被其它审批请求使用"), { name: "ApprovalIdempotencyConflictError" }),
    )
    const ErrorClass = (await import("@/lib/aim/approval-decision-store")).ApprovalIdempotencyConflictError
    mocks.settle.mockRejectedValue(new ErrorClass())

    const response = await POST(cardRequest(VALID_BODY))
    const payload = await response.json()
    expect(payload.toast.type).toBe("error")
  })

  it("缺 requestId 返回错误 toast 且不结算", async () => {
    mocks.resolveBot.mockReturnValue({ id: "bot-1" })
    const body = {
      ...VALID_BODY,
      action: { value: { hitl_action: "approve" } },
    }
    const response = await POST(cardRequest(body))
    const payload = await response.json()
    expect(payload.toast.type).toBe("error")
    expect(mocks.settle).not.toHaveBeenCalled()
  })
})
