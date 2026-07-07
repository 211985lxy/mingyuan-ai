import { describe, expect, it } from "vitest"
import {
  buildFeishuTextReply,
  parseFeishuMessageEvent,
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
})
