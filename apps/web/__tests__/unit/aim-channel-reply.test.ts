import { describe, expect, it } from "vitest"
import {
  planAimChannelReply,
  buildAimHistoryUrl,
  AIM_CHANNEL_FULL_REPLY_CHAR_LIMIT,
} from "@/features/aim-channels/aim-channel-reply"

describe("planAimChannelReply", () => {
  it("短内容直接全文回复", () => {
    const plan = planAimChannelReply({ content: "这是一条短文案。", generationId: "gen-1" })
    expect(plan.fullContent).toBe(true)
    expect(plan.summary).toBeNull()
    expect(plan.replyText).toBe("这是一条短文案。")
  })

  it("恰好等于阈值时仍全文回复（边界）", () => {
    const content = "字".repeat(AIM_CHANNEL_FULL_REPLY_CHAR_LIMIT)
    const plan = planAimChannelReply({ content, generationId: "gen-1" })
    expect(plan.fullContent).toBe(true)
  })

  it("超过阈值时改为摘要 + 链接", () => {
    const content = "字".repeat(AIM_CHANNEL_FULL_REPLY_CHAR_LIMIT + 1)
    const plan = planAimChannelReply({
      content,
      generationId: "gen-long",
      webBaseUrl: "https://mingyuan-ai.cn",
    })
    expect(plan.fullContent).toBe(false)
    expect(plan.summary).toBeTruthy()
    expect(plan.summary!.length).toBeLessThanOrEqual(200)
    expect(plan.replyText).toContain("（内容较长，完整版本：")
    expect(plan.replyText).toContain("https://mingyuan-ai.cn/aim?record=gen-long")
  })

  it("空内容当作短内容处理（不崩溃）", () => {
    const plan = planAimChannelReply({ content: "", generationId: "gen-x" })
    expect(plan.fullContent).toBe(true)
    expect(plan.replyText).toBe("")
  })

  it("无 generationId 时链接指向 /aim", () => {
    const content = "字".repeat(1000)
    const plan = planAimChannelReply({ content, generationId: undefined, webBaseUrl: "https://x.com" })
    expect(plan.replyText).toContain("https://x.com/aim")
  })
})

describe("buildAimHistoryUrl", () => {
  it("拼接带 record 参数的链接", () => {
    expect(buildAimHistoryUrl("https://mingyuan-ai.cn", "gen-1")).toBe(
      "https://mingyuan-ai.cn/aim?record=gen-1",
    )
  })

  it("去掉尾部斜杠", () => {
    expect(buildAimHistoryUrl("https://mingyuan-ai.cn/", "gen-1")).toBe(
      "https://mingyuan-ai.cn/aim?record=gen-1",
    )
  })

  it("无 generationId 时指向 /aim", () => {
    expect(buildAimHistoryUrl("https://mingyuan-ai.cn", undefined)).toBe(
      "https://mingyuan-ai.cn/aim",
    )
  })

  it("无 webBaseUrl 时用默认域名", () => {
    expect(buildAimHistoryUrl(undefined, "gen-1")).toBe("https://mingyuan-ai.cn/aim?record=gen-1")
  })
})
