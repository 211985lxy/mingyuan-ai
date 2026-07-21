import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  // prisma
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  messageUpdate: vi.fn(),
  conversationUpdate: vi.fn(),
  historyFindMany: vi.fn(),
  // background-tasks
  claimBackgroundTask: vi.fn(),
  completeBackgroundTask: vi.fn(),
  failBackgroundTask: vi.fn(),
  planBackgroundTaskFailure: vi.fn(),
  // aim generator
  generateAimContent: vi.fn(),
  // feishu send
  getFeishuTenantAccessToken: vi.fn(),
  replyFeishuTextMessage: vi.fn(),
}))

vi.mock("@/env", () => ({
  env: {
    FEISHU_APP_ID: "app-id",
    FEISHU_APP_SECRET: "app-secret",
    NEXT_PUBLIC_APP_URL: "https://mingyuan-ai.cn",
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimConversationMessage: {
      findUnique: mocks.messageFindUnique,
      create: mocks.messageCreate,
      update: mocks.messageUpdate,
      findMany: mocks.historyFindMany,
    },
    aimConversation: {
      update: mocks.conversationUpdate,
    },
  },
}))

vi.mock("@/lib/background-tasks", () => ({
  claimBackgroundTask: mocks.claimBackgroundTask,
  completeBackgroundTask: mocks.completeBackgroundTask,
  failBackgroundTask: mocks.failBackgroundTask,
  planBackgroundTaskFailure: mocks.planBackgroundTaskFailure,
}))

vi.mock("@/lib/aim-generator", () => ({
  generateAimContent: mocks.generateAimContent,
}))

vi.mock("@/lib/integrations/feishu-topic-chat", () => ({
  getFeishuTenantAccessToken: mocks.getFeishuTenantAccessToken,
  replyFeishuTextMessage: mocks.replyFeishuTextMessage,
}))

import { processAimChannelGenerate } from "@/features/aim-channels/aim-channel-generate-task"

const CONVERSATION = {
  id: "conv-1",
  userId: "user-1",
  projectId: "proj-1",
  platform: "feishu",
  externalChatId: "oc_chat1",
  agentId: "content_producer",
}

function setupUserMessage(overrides: Partial<{ content: string; externalMessageId: string | null }> = {}) {
  mocks.messageFindUnique.mockResolvedValue({
    id: "msg-1",
    role: "user",
    content: overrides.content ?? "帮我写一条抖音口播",
    agentId: "content_producer",
    externalMessageId: overrides.externalMessageId ?? "fs_msg_1",
    conversation: CONVERSATION,
  })
  mocks.historyFindMany.mockResolvedValue([])
  mocks.messageCreate.mockResolvedValue({ id: "assistant-msg-1" })
  mocks.conversationUpdate.mockResolvedValue({})
  mocks.getFeishuTenantAccessToken.mockResolvedValue("tenant-token")
  mocks.replyFeishuTextMessage.mockResolvedValue(undefined)
}

describe("processAimChannelGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("短内容：直接全文回复飞书", async () => {
    setupUserMessage()
    mocks.generateAimContent.mockResolvedValue({
      id: "gen-1",
      results: [{ format: "video_script", content: "这是一条短口播文案。", wordCount: 12 }],
      knowledgeUsed: [],
    })

    await processAimChannelGenerate("msg-1")

    expect(mocks.generateAimContent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectId: "proj-1",
        agentId: "content_producer",
        rawInput: "帮我写一条抖音口播",
        targetFormats: ["video_script"],
      }),
    )
    // assistant 消息落库
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "assistant",
          content: "这是一条短口播文案。",
          aimGenerationId: "gen-1",
          status: "completed",
        }),
      }),
    )
    // 全文回复飞书（不含链接）
    expect(mocks.replyFeishuTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "fs_msg_1",
        text: "这是一条短口播文案。",
      }),
    )
  })

  it("长内容：回复摘要 + 网页链接，并落库 resultSummary", async () => {
    setupUserMessage()
    const longText = "长".repeat(1000)
    mocks.generateAimContent.mockResolvedValue({
      id: "gen-long",
      results: [{ format: "video_script", content: longText, wordCount: 1000 }],
      knowledgeUsed: [],
    })

    await processAimChannelGenerate("msg-1")

    const replyCall = mocks.replyFeishuTextMessage.mock.calls[0][0]
    expect(replyCall.text).toContain("（内容较长，完整版本：")
    expect(replyCall.text).toContain("https://mingyuan-ai.cn/aim?record=gen-long")
    // 摘要落库
    const createCall = mocks.messageCreate.mock.calls[0][0]
    expect(createCall.data.resultSummary).toBeTruthy()
    expect(createCall.data.resultSummary.length).toBeLessThanOrEqual(200)
  })

  it("拼接多轮历史：history 非空时 rawInput 包含历史对话", async () => {
    setupUserMessage({ content: "再改短一点" })
    mocks.historyFindMany.mockResolvedValue([
      { role: "assistant", content: "第一版口播正文" },
      { role: "user", content: "帮我写一条抖音口播" },
    ])
    mocks.generateAimContent.mockResolvedValue({
      id: "gen-2",
      results: [{ format: "video_script", content: "更短的口播", wordCount: 6 }],
      knowledgeUsed: [],
    })

    await processAimChannelGenerate("msg-1")

    const callArg = mocks.generateAimContent.mock.calls[0][0]
    expect(callArg.rawInput).toContain("【历史对话】")
    expect(callArg.rawInput).toContain("用户：帮我写一条抖音口播")
    expect(callArg.rawInput).toContain("助手：第一版口播正文")
    expect(callArg.rawInput).toContain("【本轮用户输入】")
    expect(callArg.rawInput).toContain("再改短一点")
  })

  it("空输入抛错", async () => {
    setupUserMessage({ content: "   " })
    await expect(processAimChannelGenerate("msg-1")).rejects.toThrow("不能为空")
  })

  it("消息记录不存在时静默返回", async () => {
    mocks.messageFindUnique.mockResolvedValue(null)
    await expect(processAimChannelGenerate("missing")).resolves.toBeUndefined()
    expect(mocks.generateAimContent).not.toHaveBeenCalled()
  })

  it("非飞书平台：跳过回复但不阻断任务", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "msg-2",
      role: "user",
      content: "帮我写",
      agentId: "content_producer",
      externalMessageId: "wx_msg_1",
      conversation: { ...CONVERSATION, platform: "wecom" },
    })
    mocks.historyFindMany.mockResolvedValue([])
    mocks.messageCreate.mockResolvedValue({})
    mocks.conversationUpdate.mockResolvedValue({})
    mocks.generateAimContent.mockResolvedValue({
      id: "gen-3",
      results: [{ format: "video_script", content: "ok", wordCount: 2 }],
      knowledgeUsed: [],
    })

    await processAimChannelGenerate("msg-2")
    // wecom 未接入，不调用飞书发送
    expect(mocks.replyFeishuTextMessage).not.toHaveBeenCalled()
    // 但 assistant 消息仍落库
    expect(mocks.messageCreate).toHaveBeenCalled()
  })
})
