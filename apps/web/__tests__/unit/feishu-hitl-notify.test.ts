import { describe, expect, it, vi } from "vitest"

import {
  formatHitlApprovalNotification,
  readHitlNotifyConfig,
  sendHitlApprovalNotification,
} from "@/lib/aim/feishu-hitl-notify"
import type { HitlApprovalRequired } from "@/lib/aim/hitl-gate"

/**
 * Step③ P1：HITL 审批飞书通知——纯通知（不带交互按钮），
 * 配置关闭/不全时静默跳过；发送失败抛错由调用方兜底（不阻塞审批主流程）。
 */

const APPROVAL: HitlApprovalRequired = {
  approvalRequestId: "hitl:u1:export_lark_generation:p1:gen-1",
  toolAction: "export_lark_generation",
  risk: "external_send",
  label: "对外发送：把 AIM 内容回写飞书",
  status: "pending",
}

describe("HITL 飞书通知", () => {
  it("默认关闭；开关开启但配置不全也视为关闭（绝不抛错）", () => {
    expect(readHitlNotifyConfig({}).enabled).toBe(false)
    expect(
      readHitlNotifyConfig({ AIM_HITL_NOTIFY_ENABLED: "true" }).enabled,
    ).toBe(false)
    expect(
      readHitlNotifyConfig({
        AIM_HITL_NOTIFY_ENABLED: "true",
        FEISHU_APP_ID: "app",
        // 缺 chatId
      }).enabled,
    ).toBe(false)
  })

  it("配置齐全且开关开启 → enabled", () => {
    expect(
      readHitlNotifyConfig({
        AIM_HITL_NOTIFY_ENABLED: "true",
        FEISHU_APP_ID: "app",
        FEISHU_APP_SECRET: "sec",
        AIM_HITL_NOTIFY_CHAT_ID: "chat-1",
      }),
    ).toEqual({ enabled: true, appId: "app", appSecret: "sec", chatId: "chat-1" })
  })

  it("通知文本含事项、风险类型与对话内审批指引", () => {
    const text = formatHitlApprovalNotification(APPROVAL, { projectId: "p1" })
    expect(text).toContain("需人工审批")
    expect(text).toContain("对外发送：把 AIM 内容回写飞书")
    expect(text).toContain("对外发送")
    expect(text).toContain("批准")
    expect(text).toContain("驳回")
  })

  it("enabled=false 时静默跳过（不发起网络请求）", async () => {
    const fetchImpl = vi.fn()
    await sendHitlApprovalNotification({
      config: { enabled: false },
      approval: APPROVAL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("enabled=true 时按飞书消息契约发送", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("auth/v3/tenant_access_token")
        ? new Response(JSON.stringify({ code: 0, tenant_access_token: "t-1" }), { status: 200 })
        : new Response(JSON.stringify({ code: 0 }), { status: 200 }),
    ) as unknown as typeof fetch
    await sendHitlApprovalNotification({
      config: { enabled: true, appId: "app", appSecret: "sec", chatId: "chat-1" },
      approval: APPROVAL,
      context: { projectId: "p1" },
      fetchImpl,
    })
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit]
    expect(url).toContain("receive_id_type=chat_id")
    const body = JSON.parse(String(init.body))
    expect(body.receive_id).toBe("chat-1")
    expect(body.msg_type).toBe("interactive")
    const card = JSON.parse(body.content)
    expect(card.header.title.content).toContain("需人工审批")
    const actions = card.elements.find((el: { tag: string }) => el.tag === "action")
    expect(actions.actions.map((b: { value: { hitl_action: string } }) => b.value.hitl_action)).toEqual(["approve", "reject"])
    expect(actions.actions[0].value.hitl_request_id).toContain("hitl:u1:")
  })

  it("飞书返回非 0 code 时抛错（由调用方兜底）", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 99991663, msg: "bad token" }), { status: 200 }),
    ) as unknown as typeof fetch
    await expect(
      sendHitlApprovalNotification({
        config: { enabled: true, appId: "app", appSecret: "sec", chatId: "chat-1" },
        approval: APPROVAL,
        fetchImpl,
      }),
    ).rejects.toThrow("bad token")
  })
})
