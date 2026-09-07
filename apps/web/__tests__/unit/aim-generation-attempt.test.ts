import { beforeEach, describe, expect, it, vi } from "vitest"

const { findUnique, create, updateMany, deleteMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { findUnique, create, updateMany, deleteMany },
  },
}))

import {
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  startAimGenerationAttempt,
} from "@/lib/aim/generation-attempt"

const baseInput = {
  attemptId: "web_0123456789abcdef01234567",
  userId: "user-1",
  projectId: "project-1",
  agentId: "content_producer",
  rawInput: "对标标题：测试",
  targetFormats: ["video_script"],
}

beforeEach(() => {
  vi.clearAllMocks()
  findUnique.mockResolvedValue(null)
  create.mockResolvedValue({ id: baseInput.attemptId })
  updateMany.mockResolvedValue({ count: 1 })
  deleteMany.mockResolvedValue({ count: 1 })
})

describe("AIM generation attempt lifecycle", () => {
  it("reuses the same task id on a retried request without creating a duplicate", async () => {
    findUnique.mockResolvedValue({
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: baseInput.agentId,
      formatsRequested: baseInput.targetFormats,
    })

    const result = await startAimGenerationAttempt(baseInput)

    expect(result).toEqual({ id: baseInput.attemptId, created: false })
    expect(create).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("rejects a task id that belongs to different request data", async () => {
    findUnique.mockResolvedValue({
      userId: "another-user",
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: baseInput.agentId,
      formatsRequested: baseInput.targetFormats,
    })

    await expect(startAimGenerationAttempt(baseInput)).rejects.toThrow("生成任务标识与当前请求不一致")
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects reusing a task id with a different agent or output format", async () => {
    findUnique.mockResolvedValue({
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: "work_editor",
      formatsRequested: ["raw_copy"],
    })

    await expect(startAimGenerationAttempt(baseInput)).rejects.toThrow("生成任务标识与当前请求不一致")
    expect(create).not.toHaveBeenCalled()
  })

  it("only discards a provisional task created by the current request", async () => {
    await discardAimGenerationAttempt({
      id: baseInput.attemptId,
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      created: false,
    })
    expect(deleteMany).not.toHaveBeenCalled()

    await discardAimGenerationAttempt({
      id: baseInput.attemptId,
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      created: true,
    })
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: baseInput.attemptId,
        userId: baseInput.userId,
        projectId: baseInput.projectId,
        status: "pending",
      },
    })
  })

  it("marks the retained task failed with its recoverable input intact", async () => {
    await failAimGenerationAttempt({
      id: baseInput.attemptId,
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      error: new Error("模型暂时不可用"),
    })

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: baseInput.attemptId,
        userId: baseInput.userId,
        projectId: baseInput.projectId,
      },
      data: { status: "failed", errorMessage: "模型暂时不可用" },
    })
  })
})
