import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  backgroundTask: { updateMany: vi.fn(), findUnique: vi.fn() },
  agentInvocation: { findUnique: vi.fn(), update: vi.fn() },
  aimGeneration: { findUnique: vi.fn() },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun: vi.fn(async () => ({
    generationId: "gen-1",
    metadata: { runId: "run-1", provider: "test", model: "test", degraded: false, providerAttempts: [] },
  })),
  normalizeAimAgentId: (id: string) => id,
}))
vi.mock("@/lib/aim-harness/domain-executor", () => ({ executeAimGenerationDomain: vi.fn() }))
vi.mock("@/lib/aim-harness/llm-quality-policy", () => ({ resolveLlmQuality: () => ({ run: true }) }))
vi.mock("@/lib/aim-observability", () => ({ createAimTrace: vi.fn(async () => ({ id: "trace-1" })) }))
vi.mock("@/lib/account-project-context", () => ({
  assertAccountProjectExecutionContext: vi.fn(async () => ({ id: "proj-1" })),
  isAccountProjectContextError: () => false,
  logAccountProjectContextRejection: vi.fn(),
  ACCOUNT_PROJECT_CONTEXT_STALE: "ACCOUNT_PROJECT_CONTEXT_STALE",
  ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE: "stale",
  accountProjectContextStaleErrorString: () => "stale",
}))

import { executeRemoteInvocationBackgroundTask } from "@/lib/aim/services/remote-invocation-task"
import { REMOTE_ERROR_CODE } from "@/lib/aim-remote/contracts"

describe("remote invocation empty result", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.backgroundTask.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.backgroundTask.findUnique.mockResolvedValue({
      id: "task-1",
      aggregateId: "inv-1",
      leaseToken: "lease-1",
      attempt: 1,
      maxAttempts: 1,
    })
    prismaMock.agentInvocation.findUnique.mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      projectId: "proj-1",
      agentId: "work_editor",
      rawInput: "一段成稿",
      targetFormats: ["raw_copy"],
      instruction: "请润色",
      apiKey: { id: "key-1", status: "active" },
    })
    prismaMock.agentInvocation.update.mockResolvedValue({})
    prismaMock.aimGeneration.findUnique.mockResolvedValue({
      videoScript: null,
      wechatArticle: null,
      momentsPost: null,
      communityMessage: null,
      shootingBrief: null,
      rawCopy: "   ",
    })
  })

  it("marks the invocation failed when the model returns no usable copy", async () => {
    const ok = await executeRemoteInvocationBackgroundTask("task-1")
    expect(ok).toBe(true)
    expect(prismaMock.agentInvocation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        status: "failed",
        errorCode: REMOTE_ERROR_CODE.EMPTY_RESULT,
      }),
    }))
    const succeeded = prismaMock.backgroundTask.updateMany.mock.calls.some((call) => {
      const data = (call[0] as { data?: { status?: string } }).data
      return data?.status === "succeeded"
    })
    expect(succeeded).toBe(false)
  })
})