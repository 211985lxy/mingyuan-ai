import { describe, expect, it, vi } from "vitest"

const { getFeishuTenantAccessToken, replyFeishuTextMessage } = vi.hoisted(() => ({
  getFeishuTenantAccessToken: vi.fn().mockResolvedValue("tenant-token"),
  replyFeishuTextMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/env", () => ({ env: { FEISHU_APP_ID: "app-id", FEISHU_APP_SECRET: "app-secret" } }))
vi.mock("@/lib/content-pipeline", () => ({ processVideo: vi.fn() }))
vi.mock("@/lib/integrations/feishu-topic-chat", () => ({
  getFeishuTenantAccessToken,
  replyFeishuTextMessage,
}))

import {
  MediaTranscriberError,
} from "@/lib/media-transcriber/service"
import {
  buildMediaTranscriberCompletedReply,
  sendMediaTranscriberErrorReply,
  sendMediaTranscriberFinalReply,
} from "@/lib/integrations/feishu/event-replies"

describe("Feishu media-transcriber replies", () => {
  it("formats the completed document link and source metadata", () => {
    expect(buildMediaTranscriberCompletedReply({
      title: "门店经营访谈",
      platform: "douyin",
      documentUrl: "https://feishu.cn/docx/doc-1",
    })).toContain("https://feishu.cn/docx/doc-1")
  })

  it("does not expose raw unknown errors in a Feishu message", async () => {
    await sendMediaTranscriberErrorReply("om-1", new Error("secret token=sk-live"))

    expect(replyFeishuTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "om-1",
      text: expect.stringContaining("音视频转录整理失败，请换一个链接后重试。"),
      idempotencyKey: "media-transcriber:error:om-1",
    }))
    expect(replyFeishuTextMessage.mock.calls[0]?.[0]?.text).not.toContain("sk-live")
  })

  it("preserves the stable message for a typed transcriber error", async () => {
    await sendMediaTranscriberErrorReply("om-2", new MediaTranscriberError("EMPTY_TRANSCRIPT", "没有识别到有效文字。"))

    expect(replyFeishuTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "om-2",
      text: "❌ 小D整理失败：没有识别到有效文字。",
    }))
  })

  it("uses a distinct idempotency key for the final reply", async () => {
    await sendMediaTranscriberFinalReply("om-3", {
      status: "completed",
      title: "访谈",
      platform: "douyin",
      documentUrl: "https://feishu.cn/docx/doc-3",
    })

    expect(replyFeishuTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "om-3",
      idempotencyKey: "media-transcriber:final:om-3",
    }))
  })
})
