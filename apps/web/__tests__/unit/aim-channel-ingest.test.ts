import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationUpsert: vi.fn(),
  messageCreate: vi.fn(),
  enqueueBackgroundTask: vi.fn(),
  $transaction: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.$transaction,
    aimConversation: { upsert: mocks.conversationUpsert },
    aimConversationMessage: { create: mocks.messageCreate },
  },
}))

vi.mock("@/lib/background-tasks", () => ({
  enqueueBackgroundTask: mocks.enqueueBackgroundTask,
}))

import { ingestAimChannelMessage } from "@/features/aim-channels/aim-channel-ingest"

function setupTransaction(opts: { duplicate?: boolean } = {}) {
  mocks.conversationUpsert.mockResolvedValue({ id: "conv-1" })
  if (opts.duplicate) {
    mocks.messageCreate.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }))
  } else {
    mocks.messageCreate.mockResolvedValue({ id: "msg-1" })
  }
  mocks.enqueueBackgroundTask.mockResolvedValue({})
  // $transaction 接收一个回调，回调内用传入的 tx 调用 prisma 方法
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      aimConversation: { upsert: mocks.conversationUpsert },
      aimConversationMessage: { create: mocks.messageCreate },
    }
    return cb(tx)
  })
}

describe("ingestAimChannelMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("有 /命令时：建会话 + 落库 + 入队 + 返回 accepted 并带「收到」回复", async () => {
    setupTransaction()
    const result = await ingestAimChannelMessage({
      platform: "feishu",
      externalMessageId: "fs_1",
      externalChatId: "oc_1",
      userId: "user-1",
      projectId: "proj-1",
      content: "/内容创作 写一条口播",
      defaultAgentId: null,
    })

    expect(result.status).toBe("accepted")
    expect(result.shouldReply).toBe(true)
    expect(result.immediateReply).toContain("收到")
    expect(result.messageId).toBe("msg-1")

    // 会话按 agentId=content_producer 建立
    expect(mocks.conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          platform_externalChatId_agentId: {
            platform: "feishu",
            externalChatId: "oc_1",
            agentId: "content_producer",
          },
        },
      }),
    )
    // 用户消息内容是剥离前缀后的 cleanedInput
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "写一条口播",
          agentId: "content_producer",
          role: "user",
          dedupeKey: "feishu:fs_1",
        }),
      }),
    )
    // 入队生成任务
    expect(mocks.enqueueBackgroundTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "aim_channel_generate",
        aggregateId: "msg-1",
        idempotencyKey: "aim-channel-gen:feishu:fs_1",
      }),
    )
  })

  it("无命令但有默认智能体时：用默认智能体，整段文本作为输入", async () => {
    setupTransaction()
    const result = await ingestAimChannelMessage({
      platform: "feishu",
      externalMessageId: "fs_2",
      externalChatId: "oc_1",
      userId: "user-1",
      projectId: "proj-1",
      content: "帮我写一条口播",
      defaultAgentId: "content_producer",
    })

    expect(result.status).toBe("accepted")
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "帮我写一条口播",
          agentId: "content_producer",
        }),
      }),
    )
  })

  it("无命令且无默认时：ignored + 返回帮助文案", async () => {
    const result = await ingestAimChannelMessage({
      platform: "feishu",
      externalMessageId: "fs_3",
      externalChatId: "oc_1",
      userId: "user-1",
      projectId: "proj-1",
      content: "随便说点什么",
      defaultAgentId: null,
    })

    expect(result.status).toBe("ignored")
    expect(result.shouldReply).toBe(true)
    expect(result.immediateReply).toContain("/命令")
    expect(mocks.conversationUpsert).not.toHaveBeenCalled()
  })

  it("只有命令没有内容时：ignored + 提示补充内容", async () => {
    const result = await ingestAimChannelMessage({
      platform: "feishu",
      externalMessageId: "fs_4",
      externalChatId: "oc_1",
      userId: "user-1",
      projectId: "proj-1",
      content: "/内容创作",
      defaultAgentId: null,
    })

    expect(result.status).toBe("ignored")
    expect(result.shouldReply).toBe(true)
    expect(result.immediateReply).toContain("请接着发送")
    expect(mocks.conversationUpsert).not.toHaveBeenCalled()
  })

  it("重复消息（dedupeKey 冲突）：ignored，不重复入队", async () => {
    setupTransaction({ duplicate: true })
    const result = await ingestAimChannelMessage({
      platform: "feishu",
      externalMessageId: "fs_1",
      externalChatId: "oc_1",
      userId: "user-1",
      projectId: "proj-1",
      content: "/内容创作 写一条口播",
      defaultAgentId: null,
    })

    expect(result.status).toBe("ignored")
    expect(result.shouldReply).toBe(false)
    expect(result.reason).toBe("duplicate")
    // 重复时不应入队
    expect(mocks.enqueueBackgroundTask).not.toHaveBeenCalled()
  })
})
