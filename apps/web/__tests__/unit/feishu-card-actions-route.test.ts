import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  processFeishuCardApproval,
  listActiveGovernanceAssignments,
  createPrismaApprovalDecisionStore,
  resolveBotByVerificationToken,
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
} = vi.hoisted(() => ({
  processFeishuCardApproval: vi.fn(),
  listActiveGovernanceAssignments: vi.fn(),
  createPrismaApprovalDecisionStore: vi.fn(() => ({})),
  resolveBotByVerificationToken: vi.fn(),
  createLarkWorkItemStore: vi.fn(() => ({
    get: vi.fn().mockResolvedValue({
      recordId: "rec_1",
      fields: { AIM结果ID: "gen_1" },
    }),
  })),
  readWorkItemStoreConfig: vi.fn(() => ({
    baseToken: "bse_1",
    tableId: "tbl_1",
    cliPath: "/mock/lark-cli",
  })),
}))

vi.mock("@/lib/aim/approval-completion", () => ({ processFeishuCardApproval }))
vi.mock("@/lib/aim/approval-decision-prisma", () => ({
  listActiveGovernanceAssignments,
  createPrismaApprovalDecisionStore,
}))
vi.mock("@/lib/feishu-agent-registry", () => ({ resolveBotByVerificationToken }))
vi.mock("@/lib/aim/work-item-store", () => ({
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
}))

import { POST } from "@/app/api/integrations/feishu/card-actions/route"

function post(body: unknown) {
  return new Request("http://localhost/api/integrations/feishu/card-actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveBotByVerificationToken.mockReturnValue({ id: "bot_1" })
  listActiveGovernanceAssignments.mockResolvedValue([])
})

describe("feishu card-actions route", () => {
  it("匿名回调拒绝签字", async () => {
    const res = await POST(
      post({
        token: "tok",
        open_message_id: "om_anonymous",
        action: { value: { action: "approve", recordId: "rec_1", workflowId: "content-growth-v1" } },
      }),
    )
    const body = await res.json()
    expect(body.toast.type).toBe("error")
    expect(body.toast.content).toMatch(/open_id|匿名/)
    expect(processFeishuCardApproval).not.toHaveBeenCalled()
  })

  it("缺 open_message_id 拒绝，不生成 unknown_msg 幂等键", async () => {
    const res = await POST(
      post({
        token: "tok",
        open_id: "ou_reviewer",
        action: {
          value: {
            action: "approve",
            recordId: "rec_1",
            workflowId: "content-growth-v1",
          },
        },
      }),
    )
    const body = await res.json()
    expect(body.toast.content).toMatch(/open_message_id/)
    expect(processFeishuCardApproval).not.toHaveBeenCalled()
  })

  it("成功审批返回真实 approvalId，无硬编码", async () => {
    processFeishuCardApproval.mockResolvedValueOnce({
      ok: true,
      approval: { id: "apd_real_123", effectStatus: "applied" },
      idempotent: false,
      toast: "已通过审核",
    })
    const res = await POST(
      post({
        token: "tok",
        open_id: "ou_reviewer",
        user_id: "on_reviewer",
        open_message_id: "om_1",
        action: {
          value: {
            action: "approve",
            recordId: "rec_1",
            workflowId: "content-growth-v1",
            aimResultId: "gen_1",
          },
        },
      }),
    )
    const body = await res.json()
    expect(body.approvalId).toBe("apd_real_123")
    expect(body.approvalId).not.toMatch(/card-approve|hardcoded|fake/i)
    expect(processFeishuCardApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "ou_reviewer",
        externalUserId: "on_reviewer",
        recordId: "rec_1",
        action: "approve",
        aimResultId: "gen_1",
      }),
    )
  })

  it("可恢复失败透传 recoverable", async () => {
    processFeishuCardApproval.mockResolvedValueOnce({
      ok: false,
      error: "飞书暂时不可用",
      recoverable: true,
      approval: { id: "apd_1" },
    })
    const res = await POST(
      post({
        token: "tok",
        open_id: "ou_reviewer",
        open_message_id: "om_retry",
        action: {
          value: {
            action: "approve",
            recordId: "rec_1",
            workflowId: "content-growth-v1",
          },
        },
      }),
    )
    const body = await res.json()
    expect(body.recoverable).toBe(true)
    expect(body.toast.type).toBe("error")
  })
})
