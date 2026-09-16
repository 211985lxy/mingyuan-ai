import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  const env: Record<string, string | undefined> = {
    FEISHU_TOPIC_PIPELINE_ENABLED: "true",
    FEISHU_MEDIA_TRANSCRIBER_ENABLED: "true",
    FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN: "folder-1",
    FEISHU_VERIFICATION_TOKEN: "verify-1",
    FEISHU_APP_ID: "app-1",
    FEISHU_APP_SECRET: "secret-1",
    FEISHU_ENCRYPT_KEY: undefined,
    CONTENT_PIPELINE_ENABLED: "true",
  }
  return {
    env,
    runMediaTranscriptionTask: vi.fn(),
    processVideo: vi.fn(),
    sendImmediateFeishuReply: vi.fn(),
    replyFeishuTextMessage: vi.fn(),
    ingestInspirationEvent: vi.fn(),
    ingestAimChannelMessage: vi.fn(),
    resolveChannelBinding: vi.fn(),
    resolveBindingExecutionMode: vi.fn(),
  }
})

vi.mock("@/env", () => ({ env: mocks.env }))
vi.mock("@/lib/api-contract", () => ({
  parseJsonRecord: async (request: Request) => JSON.parse(await request.text()),
}))
vi.mock("@/lib/integrations/feishu-topic-chat", () => ({
  parseFeishuSdkMessageEvent: (data: { event: { text: string } }) => ({
    messageId: "om-1",
    chatId: "oc-1",
    senderId: "ou-1",
    text: data.event.text,
    occurredAt: "2026-09-15T08:00:00.000Z",
    mentionsBot: false,
  }),
  verifyFeishuEventToken: () => true,
  getFeishuTenantAccessToken: vi.fn(),
  replyFeishuTextMessage: mocks.replyFeishuTextMessage,
  shouldPrioritizeInspirationCapture: (routeTarget: string, explicit: boolean) => routeTarget === "aim" && explicit,
  isExplicitInspirationCaptureMessage: (text: string) => text.includes("收选题"),
}))
vi.mock("@/lib/integrations/feishu/event-replies", () => ({
  buildVideoCompletionMessage: vi.fn(),
  MEDIA_TRANSCRIBER_ACCEPTED_REPLY: "已收到，正在转录并整理为可读文稿。完成后我会把飞书文档发在这里。",
  sendImmediateFeishuReply: mocks.sendImmediateFeishuReply,
  sendMediaTranscriberErrorReply: vi.fn(),
  sendMediaTranscriberFinalReply: vi.fn(),
}))
vi.mock("@/features/topics/services/inspiration-events", () => ({
  ingestInspirationEvent: mocks.ingestInspirationEvent,
  resolveChannelBinding: mocks.resolveChannelBinding,
  resolveBindingExecutionMode: mocks.resolveBindingExecutionMode,
  isExplicitInspirationCaptureMessage: (text: string) => text.includes("收选题"),
}))
vi.mock("@/lib/execution-mode", () => ({ isReplySuppressed: (mode: string) => mode !== "live" }))
vi.mock("@/features/aim-channels/aim-channel-ingest", () => ({ ingestAimChannelMessage: mocks.ingestAimChannelMessage }))
vi.mock("@/lib/content-pipeline", () => ({
  detectVideoLinks: (text: string) => text.includes("https://")
    ? { hasLinks: true, textWithoutLinks: "", links: [{ url: "https://v.douyin.com/demo/", platform: "douyin" }] }
    : { hasLinks: false, textWithoutLinks: text, links: [] },
  processVideo: mocks.processVideo,
}))
vi.mock("@/lib/media-transcriber/service", () => ({
  runMediaTranscriptionTask: mocks.runMediaTranscriptionTask,
}))
vi.mock("@larksuiteoapi/node-sdk", () => ({
  LoggerLevel: { error: "error" },
  AESCipher: class {},
  generateChallenge: () => ({ isChallenge: false }),
  EventDispatcher: class {
    private handler?: (data: unknown) => Promise<unknown>
    constructor() {}
    register(handlers: Record<string, (data: unknown) => Promise<unknown>>) {
      this.handler = handlers["im.message.receive_v1"]
      return this
    }
    async invoke(payload: { event: { text: string } }) {
      return this.handler?.({ token: "verify-1", ...payload })
    }
  },
}))
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return { ...actual, after: (callback: () => Promise<void>) => void callback() }
})

import { POST } from "@/app/api/integrations/feishu/events/route"

function feishuEvent(text: string) {
  return new NextRequest("http://localhost/api/integrations/feishu/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: { text } }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.FEISHU_MEDIA_TRANSCRIBER_ENABLED = "true"
  mocks.resolveChannelBinding.mockResolvedValue({
    userId: "user-1",
    projectId: "project-1",
    externalAccountId: "",
    routeTarget: "topic",
    triggerKeywords: ["收选题"],
  })
  mocks.resolveBindingExecutionMode.mockReturnValue("live")
  mocks.runMediaTranscriptionTask.mockResolvedValue({
    status: "completed",
    taskId: "task-1",
    title: "门店经营访谈",
    platform: "douyin",
    documentToken: "doc-1",
    documentUrl: "https://feishu.cn/docx/doc-1",
  })
  mocks.processVideo.mockResolvedValue({ success: true, durationMs: 1 })
})

describe("POST /api/integrations/feishu/events media transcriber routing", () => {
  it("routes an explicit 小D link to the media transcriber", async () => {
    const response = await POST(feishuEvent("小D，整理一下 https://v.douyin.com/demo/"))

    expect(response.status).toBe(200)
    expect(mocks.runMediaTranscriptionTask).toHaveBeenCalledTimes(1)
    expect(mocks.processVideo).not.toHaveBeenCalled()
  })

  it("keeps a plain video link on the existing pipeline", async () => {
    await POST(feishuEvent("https://v.douyin.com/demo/"))

    expect(mocks.processVideo).toHaveBeenCalledTimes(1)
    expect(mocks.runMediaTranscriptionTask).not.toHaveBeenCalled()
  })

  it("keeps 收选题 ahead of 小D routing", async () => {
    await POST(feishuEvent("小D 收选题 https://v.douyin.com/demo/"))

    expect(mocks.ingestInspirationEvent).toHaveBeenCalledTimes(1)
    expect(mocks.runMediaTranscriptionTask).not.toHaveBeenCalled()
  })

  it.each(["capture_only", "evaluate"])("suppresses document work in %s", async (mode) => {
    mocks.resolveBindingExecutionMode.mockReturnValue(mode)

    await POST(feishuEvent("小D，整理一下 https://v.douyin.com/demo/"))

    expect(mocks.runMediaTranscriptionTask).not.toHaveBeenCalled()
    expect(mocks.sendImmediateFeishuReply).not.toHaveBeenCalled()
  })
})
