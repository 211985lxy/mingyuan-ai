import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  channelReplyOutbox: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  backgroundTask: {
    upsert: vi.fn(),
  },
  transaction: vi.fn(),
  prisma: {
    channelReplyOutbox: {} as ReturnType<typeof vi.fn>,
    backgroundTask: {} as ReturnType<typeof vi.fn>,
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    channelReplyOutbox: mocks.channelReplyOutbox,
    backgroundTask: mocks.backgroundTask,
  },
}))

vi.mock("@/lib/background-tasks", () => ({
  enqueueBackgroundTask: vi.fn(),
  claimBackgroundTask: vi.fn(),
  completeBackgroundTask: vi.fn(),
  failBackgroundTask: vi.fn(),
}))

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://aim.example.com" } }))

import { OUTBOX_SEND_TASK_KIND, enqueueReply, acknowledgeOutboxReply, claimOutboxReplies, MAX_OUTBOX_ATTEMPTS, computeOutboxRetryAvailableAt } from "@/features/topics/services/reply-outbox"
import { enqueueBackgroundTask } from "@/lib/background-tasks"

const mockedEnqueue = vi.mocked(enqueueBackgroundTask)

describe("reply-outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      channelReplyOutbox: mocks.channelReplyOutbox,
      backgroundTask: mocks.backgroundTask,
    }))
  })

  describe("OUTBOX_SEND_TASK_KIND", () => {
    it("is the expected task kind string", () => {
      expect(OUTBOX_SEND_TASK_KIND).toBe("inspiration_outbox_send")
    })
  })

  describe("MAX_OUTBOX_ATTEMPTS", () => {
    it("defaults to 5", () => {
      expect(MAX_OUTBOX_ATTEMPTS).toBe(5)
    })
  })

  describe("computeOutboxRetryAvailableAt", () => {
    it("returns 1 minute delay for attempt 1", () => {
      const now = new Date("2026-07-23T08:00:00.000Z")
      const result = computeOutboxRetryAvailableAt(1, now)
      expect(result).toEqual(new Date("2026-07-23T08:01:00.000Z"))
    })

    it("returns 5 minute delay for attempt 2", () => {
      const now = new Date("2026-07-23T08:00:00.000Z")
      const result = computeOutboxRetryAvailableAt(2, now)
      expect(result).toEqual(new Date("2026-07-23T08:05:00.000Z"))
    })

    it("returns 30 minute delay for attempt 3+", () => {
      const now = new Date("2026-07-23T08:00:00.000Z")
      const result = computeOutboxRetryAvailableAt(4, now)
      expect(result).toEqual(new Date("2026-07-23T08:30:00.000Z"))
    })
  })

  describe("enqueueReply", () => {
    it("upserts an outbox record with correct fields", async () => {
      mocks.channelReplyOutbox.upsert.mockResolvedValue({ id: "outbox-1", status: "pending" })
      await enqueueReply({
        inspirationId: "insp-1",
        replyType: "final",
        platform: "feishu",
        externalChatId: "chat-1",
        externalMessageId: "msg-1",
        replyText: "推荐先拍：选题一",
      })
      expect(mocks.channelReplyOutbox.upsert).toHaveBeenCalledWith({
        where: { inspirationId_replyType: { inspirationId: "insp-1", replyType: "final" } },
        create: expect.objectContaining({
          inspirationId: "insp-1",
          replyType: "final",
          platform: "feishu",
          externalChatId: "chat-1",
          externalMessageId: "msg-1",
          replyText: "推荐先拍：选题一",
          status: "pending",
        }),
        update: expect.objectContaining({
          replyText: "推荐先拍：选题一",
          status: "pending",
          claimToken: null,
          claimExpiresAt: null,
          lastError: null,
        }),
      })
    })

    it("enqueues a background task for feishu platform with dedupe key", async () => {
      mocks.channelReplyOutbox.upsert.mockResolvedValue({ id: "outbox-1", status: "pending" })
      await enqueueReply({
        inspirationId: "insp-1",
        replyType: "final",
        platform: "feishu",
        externalChatId: "chat-1",
        replyText: "推荐先拍：选题一",
      })
      expect(mockedEnqueue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: OUTBOX_SEND_TASK_KIND,
          aggregateType: "channel_reply_outbox",
          aggregateId: "outbox-1",
          idempotencyKey: "outbox-send:insp-1:final",
        }),
      )
    })

    it("does not enqueue a background task when skipBackgroundTask is true", async () => {
      mocks.channelReplyOutbox.upsert.mockResolvedValue({ id: "outbox-1", status: "pending" })
      await enqueueReply({
        inspirationId: "insp-1",
        replyType: "accepted",
        platform: "feishu",
        externalChatId: "chat-1",
        replyText: "已收录",
        skipBackgroundTask: true,
      })
      expect(mockedEnqueue).not.toHaveBeenCalled()
    })

    it("does not enqueue a background task for external platforms", async () => {
      mocks.channelReplyOutbox.upsert.mockResolvedValue({ id: "outbox-2", status: "pending" })
      await enqueueReply({
        inspirationId: "insp-1",
        replyType: "final",
        platform: "wecom",
        externalChatId: "chat-1",
        replyText: "推荐先拍：选题一",
      })
      expect(mockedEnqueue).not.toHaveBeenCalled()
    })

    it("supports error reply type", async () => {
      mocks.channelReplyOutbox.upsert.mockResolvedValue({ id: "outbox-err", status: "pending" })
      await enqueueReply({
        inspirationId: "insp-1",
        replyType: "error",
        platform: "feishu",
        externalChatId: "chat-1",
        replyText: "提取服务暂时不可用",
      })
      expect(mocks.channelReplyOutbox.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inspirationId_replyType: { inspirationId: "insp-1", replyType: "error" } },
        }),
      )
    })
  })

  describe("claimOutboxReplies", () => {
    it("claims pending replies with a token", async () => {
      // Reset stale claims
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 0 })
      // Find candidates
      mocks.channelReplyOutbox.findMany.mockResolvedValue([{
        id: "outbox-1",
        platform: "wecom",
        externalChatId: "chat-1",
        externalMessageId: "msg-1",
        replyText: "推荐先拍：选题一",
        replyType: "final",
      }])
      // Claim one
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 1 })

      const items = await claimOutboxReplies({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        platform: "wecom",
      })
      expect(items).toHaveLength(1)
      expect(items[0].claimToken).toMatch(/^[0-9a-f-]{36}$/)
      expect(items[0].platform).toBe("wecom")
    })

    it("filters by availableAt when finding candidates", async () => {
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 0 })
      mocks.channelReplyOutbox.findMany.mockResolvedValue([])

      await claimOutboxReplies({ userId: "user-1", allowedProjects: ["proj-1"], platform: "wecom" })

      expect(mocks.channelReplyOutbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            availableAt: { lte: expect.any(Date) },
          }),
        }),
      )
    })

    it("resets stale claims before claiming", async () => {
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 2 })
      mocks.channelReplyOutbox.findMany.mockResolvedValue([])

      await claimOutboxReplies({ userId: "user-1", allowedProjects: ["proj-1"], platform: "wecom" })

      // First call: reset stale claims
      expect(mocks.channelReplyOutbox.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "sending" }),
        }),
      )
    })

    it("skips candidates that fail CAS update", async () => {
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 0 }) // reset stale
      mocks.channelReplyOutbox.findMany.mockResolvedValue([
        { id: "outbox-1", platform: "wecom", externalChatId: "chat-1", externalMessageId: "msg-1", replyText: "文本", replyType: "final" },
        { id: "outbox-2", platform: "wecom", externalChatId: "chat-2", externalMessageId: "msg-2", replyText: "文本2", replyType: "final" },
      ])
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 0 }) // CAS fail for outbox-1
      mocks.channelReplyOutbox.updateMany.mockResolvedValueOnce({ count: 1 }) // CAS success for outbox-2

      const items = await claimOutboxReplies({ userId: "user-1", allowedProjects: ["proj-1"], platform: "wecom" })
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe("outbox-2")
    })
  })

  describe("acknowledgeOutboxReply", () => {
    it("marks reply as sent when sent is true", async () => {
      mocks.channelReplyOutbox.findUnique.mockResolvedValue({
        id: "outbox-1",
        status: "sending",
        inspiration: { userId: "user-1", projectId: "proj-1" },
      })
      mocks.channelReplyOutbox.updateMany.mockResolvedValue({ count: 1 })

      const result = await acknowledgeOutboxReply({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        replyId: "outbox-1",
        claimToken: "token-1",
        sent: true,
      })
      expect(result).toBe(true)
      expect(mocks.channelReplyOutbox.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ claimToken: "token-1", status: "sending" }),
          data: expect.objectContaining({ status: "sent" }),
        }),
      )
    })

    it("marks reply as retry_wait when sent is false", async () => {
      mocks.channelReplyOutbox.findUnique.mockResolvedValue({
        id: "outbox-1",
        status: "sending",
        inspiration: { userId: "user-1", projectId: "proj-1" },
      })
      mocks.channelReplyOutbox.updateMany.mockResolvedValue({ count: 1 })

      const result = await acknowledgeOutboxReply({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        replyId: "outbox-1",
        claimToken: "token-1",
        sent: false,
        errorMessage: "发送超时",
      })
      expect(result).toBe(true)
      expect(mocks.channelReplyOutbox.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "retry_wait", lastError: "发送超时" }),
        }),
      )
    })

    it("returns true idempotently when reply is already sent", async () => {
      mocks.channelReplyOutbox.findUnique.mockResolvedValue({
        id: "outbox-1",
        status: "sent",
        inspiration: { userId: "user-1", projectId: "proj-1" },
      })

      const result = await acknowledgeOutboxReply({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        replyId: "outbox-1",
        claimToken: "token-1",
        sent: true,
      })
      expect(result).toBe(true)
      // Should NOT attempt updateMany since status is already "sent"
      expect(mocks.channelReplyOutbox.updateMany).not.toHaveBeenCalled()
    })

    it("returns false when reply not found", async () => {
      mocks.channelReplyOutbox.findUnique.mockResolvedValue(null)

      const result = await acknowledgeOutboxReply({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        replyId: "outbox-1",
        claimToken: "token-1",
        sent: true,
      })
      expect(result).toBe(false)
    })

    it("returns false when userId does not match", async () => {
      mocks.channelReplyOutbox.findUnique.mockResolvedValue({
        id: "outbox-1",
        status: "sending",
        inspiration: { userId: "user-2", projectId: "proj-1" },
      })

      const result = await acknowledgeOutboxReply({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        replyId: "outbox-1",
        claimToken: "token-1",
        sent: true,
      })
      expect(result).toBe(false)
    })

    it("returns false when claimToken does not match (CAS failure)", async () => {
      mocks.channelReplyOutbox.findUnique.mockResolvedValue({
        id: "outbox-1",
        status: "sending",
        inspiration: { userId: "user-1", projectId: "proj-1" },
      })
      mocks.channelReplyOutbox.updateMany.mockResolvedValue({ count: 0 })

      const result = await acknowledgeOutboxReply({
        userId: "user-1",
        allowedProjects: ["proj-1"],
        replyId: "outbox-1",
        claimToken: "wrong-token",
        sent: true,
      })
      expect(result).toBe(false)
    })
  })
})
