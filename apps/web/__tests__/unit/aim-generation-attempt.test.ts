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
  AimGenerationAttemptError,
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  markAimGenerationAwaitingInput,
  markAimGenerationRunning,
  startAimGenerationAttempt,
  sweepStaleAimGenerations,
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
      status: "pending",
    })

    const result = await startAimGenerationAttempt(baseInput)

    expect(result).toEqual({ id: baseInput.attemptId, created: false, replay: "continue" })
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects a task id that belongs to a different user, project or request body", async () => {
    findUnique.mockResolvedValue({
      userId: "another-user",
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: baseInput.agentId,
      formatsRequested: baseInput.targetFormats,
      status: "pending",
    })

    await expect(startAimGenerationAttempt(baseInput)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("returns GENERATION_IN_PROGRESS for a still-running attempt and does not recreate", async () => {
    findUnique.mockResolvedValue({
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: baseInput.agentId,
      formatsRequested: baseInput.targetFormats,
      status: "running",
    })

    await expect(startAimGenerationAttempt(baseInput)).rejects.toBeInstanceOf(AimGenerationAttemptError)
    await expect(startAimGenerationAttempt(baseInput)).rejects.toMatchObject({
      code: "GENERATION_IN_PROGRESS",
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("replays a completed or failed attempt instead of calling the model again", async () => {
    findUnique.mockResolvedValue({
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: baseInput.agentId,
      formatsRequested: baseInput.targetFormats,
      status: "completed",
    })
    await expect(startAimGenerationAttempt(baseInput)).resolves.toMatchObject({
      id: baseInput.attemptId,
      created: false,
      replay: "completed",
    })

    findUnique.mockResolvedValue({
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      rawInput: baseInput.rawInput,
      agentId: "business_diagnosis",
      formatsRequested: ["raw_copy"],
      status: "failed",
      errorMessage: "模型暂时不可用",
    })
    await expect(startAimGenerationAttempt({
      ...baseInput,
      agentId: "business_diagnosis",
      targetFormats: ["raw_copy"],
    })).resolves.toMatchObject({
      replay: "failed",
      errorMessage: "模型暂时不可用",
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("covers business diagnosis and producer aliases with the same service", async () => {
    create.mockResolvedValue({ id: "alias-1" })
    const result = await startAimGenerationAttempt({
      ...baseInput,
      attemptId: undefined,
      agentId: "ip_video",
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentId: "content_producer", status: "pending", projectId: "project-1" }),
    }))
    expect(result.created).toBe(true)
  })

  it("only discards a provisional task created by a chat reply on this request", async () => {
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
        status: { in: ["pending", "running"] },
      },
    })
  })

  it("keeps clarification as awaiting_input instead of deleting the task", async () => {
    await markAimGenerationAwaitingInput({
      id: baseInput.attemptId,
      userId: baseInput.userId,
      projectId: baseInput.projectId,
    })
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: baseInput.attemptId, userId: "user-1", projectId: "project-1" },
      data: expect.objectContaining({ status: "awaiting_input" }),
    }))
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("marks the retained task failed with its recoverable input intact", async () => {
    await failAimGenerationAttempt({
      id: baseInput.attemptId,
      userId: baseInput.userId,
      projectId: baseInput.projectId,
      error: new Error("模型暂时不可用"),
      code: "PROVIDER_UNAVAILABLE",
    })

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: baseInput.attemptId,
        userId: baseInput.userId,
        projectId: baseInput.projectId,
      },
      data: expect.objectContaining({
        status: "failed",
        errorMessage: "模型暂时不可用",
      }),
    })
  })

  it("sweeps pending/running tasks older than 10 minutes to failed/STALE_EXECUTION", async () => {
    await sweepStaleAimGenerations(new Date("2026-09-07T08:00:00.000Z"))
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["pending", "running"] },
        updatedAt: { lt: new Date("2026-09-07T07:50:00.000Z") },
      }),
      data: expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("STALE_EXECUTION"),
      }),
    }))
  })

  it("marks a started task running before model calls", async () => {
    await markAimGenerationRunning({
      id: baseInput.attemptId,
      userId: baseInput.userId,
      projectId: baseInput.projectId,
    })
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "running" },
    }))
  })
})
