import { describe, expect, it, vi } from "vitest"
import {
  formatSupervisorNotification,
  readSupervisorNotificationConfig,
  sanitizeSupervisorText,
  sendFeishuSupervisorNotification,
} from "@/lib/aim/feishu-supervisor-notifier"

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response
}

describe("feishu supervisor notifier", () => {
  it("默认关闭，不要求飞书凭据且不产生外部请求", async () => {
    const config = readSupervisorNotificationConfig({} as NodeJS.ProcessEnv)
    const fetchImpl = vi.fn()
    await sendFeishuSupervisorNotification({
      config,
      notification: {
        type: "review_required",
        recordId: "rec_1",
        loopId: "sales-diagnosis-v1",
        summary: "诊断完成",
        nextAction: "人工审核",
      },
      fetchImpl,
    })
    expect(config).toEqual({ enabled: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("启用时缺少任一凭据立即 fail-closed", () => {
    expect(() => readSupervisorNotificationConfig({
      AIM_LOOP_NOTIFICATIONS_ENABLED: "true",
      FEISHU_APP_ID: "app_1",
    } as unknown as NodeJS.ProcessEnv)).toThrow("FEISHU_APP_SECRET")
  })

  it("复用租户令牌后向监督群发送文本消息", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: "tenant_1" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }))
    await sendFeishuSupervisorNotification({
      config: { enabled: true, appId: "app_1", appSecret: "secret_1", chatId: "oc_1" },
      notification: {
        type: "human_judgment",
        recordId: "rec_1",
        loopId: "sales-diagnosis-v1",
        runId: "run_1",
        summary: "预算缺少原文证据",
        nextAction: "请明远审核",
        resultLink: "https://example.com/result",
      },
      fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1]?.[0]).toContain("receive_id_type=chat_id")
    const body = JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)
    expect(body.receive_id).toBe("oc_1")
    expect(JSON.parse(body.content).text).toContain("预算缺少原文证据")
  })

  it("飞书业务错误不伪报成功", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: "tenant_1" }))
      .mockResolvedValueOnce(jsonResponse({ code: 999, msg: "chat not found" }))
    await expect(sendFeishuSupervisorNotification({
      config: { enabled: true, appId: "app_1", appSecret: "secret_1", chatId: "bad" },
      notification: {
        type: "manual_takeover",
        recordId: "rec_1",
        loopId: "sales-diagnosis-v1",
        summary: "失败",
        nextAction: "人工处理",
      },
      fetchImpl,
    })).rejects.toThrow("chat not found")
  })

  it("格式包含任务、摘要、下一步和结果链接", () => {
    expect(formatSupervisorNotification({
      type: "review_required",
      recordId: "rec_1",
      loopId: "sales-diagnosis-v1",
      summary: "完成",
      nextAction: "审核",
      resultLink: "https://example.com/result",
    })).toContain("结果：https://example.com/result")
  })

  it("发送边界会脱敏 Authorization、token、secret 和 sk key", () => {
    const sanitized = sanitizeSupervisorText(
      "Authorization: Bearer abc token=private secret=hidden sk-1234567890abcdef",
    )
    expect(sanitized).not.toContain("abc")
    expect(sanitized).not.toContain("private")
    expect(sanitized).not.toContain("hidden")
    expect(sanitized).not.toContain("1234567890abcdef")
  })
})
