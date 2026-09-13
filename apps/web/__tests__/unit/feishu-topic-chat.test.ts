import { describe, expect, it } from "vitest"
import {
  buildFeishuTextReply,
  parseFeishuMessageEvent,
  parseFeishuSdkMessageEvent,
  replyFeishuTextMessage,
  shouldPrioritizeInspirationCapture,
  toFeishuReplyUuid,
  verifyFeishuEventToken,
} from "@/lib/integrations/feishu-topic-chat"

describe("feishu topic chat integration", () => {
  it("verifies url verification token", () => {
    expect(verifyFeishuEventToken({ token: "secret" }, "secret")).toBe(true)
    expect(verifyFeishuEventToken({ token: "wrong" }, "secret")).toBe(false)
  })

  it("verifies v2 event header token", () => {
    expect(verifyFeishuEventToken({ header: { token: "secret" } }, "secret")).toBe(true)
  })

  it("parses text message event", () => {
    const event = parseFeishuMessageEvent({
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "user" },
        message: {
          message_id: "om_123",
          message_type: "text",
          content: "{\"text\":\"今天客户又问我为什么报价比别人高\"}",
        },
      },
    })

    expect(event).toEqual({
      messageId: "om_123",
      text: "今天客户又问我为什么报价比别人高",
    })
  })

  it("ignores bot messages", () => {
    const event = parseFeishuMessageEvent({
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "app" },
        message: {
          message_id: "om_123",
          message_type: "text",
          content: "{\"text\":\"hello\"}",
        },
      },
    })

    expect(event).toBeNull()
  })

  it("parses SDK message data and normalizes bot mentions", () => {
    expect(parseFeishuSdkMessageEvent({
      sender: { sender_type: "user", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        create_time: "1784548800000",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_1 收选题 https://v.douyin.com/demo/" }),
        mentions: [{ key: "@_user_1", name: "AIM" }],
      },
    })).toEqual({
      messageId: "om_1",
      chatId: "oc_1",
      senderId: "ou_1",
      text: "@助手 收选题 https://v.douyin.com/demo/",
      occurredAt: "2026-07-20T12:00:00.000Z",
      mentionsBot: false,
    })
  })

  it("formats topic chat reply for Feishu text", () => {
    const text = buildFeishuTextReply({
      reply: {
        summary: "这句话已经沉淀为：客户问题：为什么报价比别人高",
        recommendedTitle: "贵在哪里",
        opening: "客户问你为什么贵，千万别先解释成本。",
        alternatives: ["报价的底气", "别只比价格"],
        nextActionLabel: "继续写成口播稿",
      },
    })

    expect(text).toContain("建议先拍：贵在哪里")
    expect(text).toContain("开头：客户问你为什么贵，千万别先解释成本。")
    expect(text).toContain("还能拍：报价的底气、别只比价格")
  })

  it("routes explicit AIM capture messages to inspiration before the legacy video pipeline", () => {
    expect(shouldPrioritizeInspirationCapture("aim", true)).toBe(true)
  })

  it("keeps ordinary AIM video messages on the legacy video pipeline", () => {
    expect(shouldPrioritizeInspirationCapture("aim", false)).toBe(false)
  })
})

describe("toFeishuReplyUuid", () => {
  it("passes short idempotency keys through unchanged", () => {
    expect(toFeishuReplyUuid("outbox-accepted-cmtz9s0g1001j29n4500a8q5p"))
      .toBe("outbox-accepted-cmtz9s0g1001j29n4500a8q5p")
  })

  it("returns undefined when no key is given", () => {
    expect(toFeishuReplyUuid(undefined)).toBeUndefined()
  })

  // 真实回归：aim-channel-ack: + 35 位 message_id = 51 字符，飞书直接拒整条请求。
  it("shrinks the 51-char ack key that Feishu rejects", () => {
    const overflowing = "aim-channel-ack:om_x100b6555f10710a8df9da3bd777b009"
    expect(overflowing).toHaveLength(51)
    const uuid = toFeishuReplyUuid(overflowing)
    expect(uuid).toHaveLength(50)
    expect(uuid).not.toBe(overflowing)
  })

  it("is deterministic for the same key and distinct across keys", () => {
    const a = `aim-channel-ack:${"om_".padEnd(35, "a")}`
    const b = `aim-channel-ack:${"om_".padEnd(35, "b")}`
    expect(toFeishuReplyUuid(a)).toBe(toFeishuReplyUuid(a))
    expect(toFeishuReplyUuid(a)).not.toBe(toFeishuReplyUuid(b))
  })
})

describe("replyFeishuTextMessage", () => {
  const messageId = "om_x100b6555f10710a8df9da3bd777b009"

  function captureReplyBody() {
    const bodies: Array<Record<string, unknown>> = []
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>)
      return { ok: true, json: async () => ({ code: 0 }) }
    }) as unknown as typeof fetch
    return { bodies, fetchImpl }
  }

  it("never sends a uuid longer than Feishu's 50-char limit", async () => {
    const { bodies, fetchImpl } = captureReplyBody()
    await replyFeishuTextMessage({
      messageId,
      text: "已记录灵感 ✅",
      tenantAccessToken: "t-1",
      idempotencyKey: `aim-channel-ack:${messageId}`,
      fetchImpl,
    })
    expect(String(bodies[0].uuid).length).toBeLessThanOrEqual(50)
  })

  it("still sends the reply text and message type", async () => {
    const { bodies, fetchImpl } = captureReplyBody()
    await replyFeishuTextMessage({
      messageId,
      text: "已记录灵感 ✅",
      tenantAccessToken: "t-1",
      idempotencyKey: "short-key",
      fetchImpl,
    })
    expect(bodies[0]).toMatchObject({ msg_type: "text", uuid: "short-key" })
    expect(JSON.parse(String(bodies[0].content))).toEqual({ text: "已记录灵感 ✅" })
  })
})
