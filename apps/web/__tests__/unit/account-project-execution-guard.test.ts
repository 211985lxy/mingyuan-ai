import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

// ---------------------------------------------------------------------------
// Prisma mock — shared across all tests. The account-project guard reads the
// binding via prisma.user / prisma.clientProject; the background-task helpers
// use prisma.backgroundTask; each worker reads its owning entity.
// ---------------------------------------------------------------------------
const prismaMock = vi.hoisted(() => {
  const backgroundTask = {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  }
  const user = { findUnique: vi.fn() }
  const clientProject = { findFirst: vi.fn(), count: vi.fn() }
  const agentInvocation = { findUnique: vi.fn(), update: vi.fn() }
  const aimGeneration = { findUnique: vi.fn(), update: vi.fn() }
  const inspiration = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  }
  const tx = { inspiration: { updateMany: vi.fn() } }
  const $transaction = vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx))
  return {
    backgroundTask,
    user,
    clientProject,
    agentInvocation,
    aimGeneration,
    inspiration,
    tx,
    $transaction,
    prisma: {
      backgroundTask,
      user,
      clientProject,
      agentInvocation,
      aimGeneration,
      inspiration,
      $transaction,
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock.prisma }))

// ---------------------------------------------------------------------------
// Mock the model-execution surface of each worker so we can assert it is NOT
// invoked when the account-project guard rejects. Mocking by the worker's own
// resolved path (via the "@" alias) ensures the mock applies module-wide.
// ---------------------------------------------------------------------------
const { executeAimRunMock, normalizeAimAgentIdMock } = vi.hoisted(() => ({
  executeAimRunMock: vi.fn(),
  normalizeAimAgentIdMock: vi.fn((id: string) => id),
}))
vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun: executeAimRunMock,
  normalizeAimAgentId: normalizeAimAgentIdMock,
}))
vi.mock("@/lib/aim-harness/domain-executor", () => ({
  executeAimGenerationDomain: vi.fn(),
}))
vi.mock("@/lib/aim-harness/llm-quality-policy", () => ({
  resolveLlmQuality: vi.fn(() => ({ run: true })),
}))
vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(),
}))

const { generateAimContentMock } = vi.hoisted(() => ({ generateAimContentMock: vi.fn() }))
vi.mock("@/lib/aim-generator", () => ({ generateAimContent: generateAimContentMock }))

// Ensure the newsroom worker would actually reach its model call (a non-empty
// brief) when the guard is NOT wired, so the test is a genuine RED.
const { getMaterialAnchorsMock } = vi.hoisted(() => ({ getMaterialAnchorsMock: vi.fn() }))
vi.mock("@/features/newsroom/services/build-source-brief", () => ({
  getMaterialAnchorsFromTaskSpec: getMaterialAnchorsMock,
  buildSourceBrief: vi.fn(),
  formatSourceBriefSummary: vi.fn(() => "summary"),
}))

const { processInspirationMock } = vi.hoisted(() => ({ processInspirationMock: vi.fn() }))
vi.mock("@/features/topics/services/process-inspiration", () => ({
  processInspiration: processInspirationMock,
}))

const { processInspirationPipelineMock } = vi.hoisted(() => ({
  processInspirationPipelineMock: vi.fn(),
}))
vi.mock("@/features/topics/services/inspiration-pipeline", () => ({
  processInspirationPipeline: processInspirationPipelineMock,
}))

const { enqueueReplyMock } = vi.hoisted(() => ({ enqueueReplyMock: vi.fn() }))
vi.mock("@/features/topics/services/reply-outbox", () => ({
  enqueueReply: enqueueReplyMock,
}))
vi.mock("@/lib/channel-metrics", () => ({
  recordChannelMetric: vi.fn(() => Promise.resolve()),
}))

import {
  assertAccountProjectExecutionContext,
  AccountProjectContextError,
  isAccountProjectContextError,
  ACCOUNT_PROJECT_CONTEXT_STALE,
} from "@/lib/account-project-context"

import { executeRemoteInvocationBackgroundTask } from "@/lib/aim/services/remote-invocation-task"
import { executeNewsroomPipelineBackgroundTask } from "@/features/newsroom/services/newsroom-pipeline-task"
import { executeInspirationBackgroundTask } from "@/features/topics/services/inspiration-background-task"
import { executeInspirationPipelineBackgroundTask } from "@/features/topics/services/inspiration-pipeline-background-task"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    aggregateId: "agg-1",
    aggregateType: "test",
    kind: "test",
    leaseToken: "lease-1",
    attempt: 1,
    maxAttempts: 1,
    availableAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

function bindUserTo(boundProjectId: string | null) {
  prismaMock.user.findUnique.mockResolvedValue({ boundProjectId })
}

function claimAlways() {
  prismaMock.backgroundTask.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.backgroundTask.findUnique.mockResolvedValue(makeTask())
}

function wasTaskMarkedSuccess() {
  const calls = prismaMock.backgroundTask.updateMany.mock.calls
  return calls.some((c) => {
    const data = (c[0] as { data?: Record<string, unknown> })?.data
    return data?.status === "succeeded"
  })
}

/** Data of the last `status: "failed"` background-task update (if any). */
function taskFailCallData(): { status?: string; lastError?: string } | undefined {
  const calls = prismaMock.backgroundTask.updateMany.mock.calls
  const failCall = calls.find((c) => {
    const data = (c[0] as { data?: Record<string, unknown> })?.data
    return data && data.status === "failed"
  })
  return failCall ? (failCall[0] as { data?: { status?: string; lastError?: string } }).data : undefined
}

/** Whether any background-task update parked the task in retry_wait. */
function wasTaskRetryWaiting() {
  const calls = prismaMock.backgroundTask.updateMany.mock.calls
  return calls.some((c) => {
    const data = (c[0] as { data?: Record<string, unknown> })?.data
    return data?.status === "retry_wait"
  })
}

// Concrete procedure type so `mock.calls` is `unknown[][]` (the generic
// `ReturnType<typeof vi.spyOn>` degrades to a non-inferrable mock type).
let consoleErrorSpy: MockInstance<(...args: unknown[]) => void>

beforeEach(() => {
  vi.clearAllMocks()
  claimAlways()
  // Silence the guard's audit log and capture it so we can assert safe logging.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Guard behaviour — (a) match, (b) mismatch, (c) bound project unavailable
// ---------------------------------------------------------------------------
describe("assertAccountProjectExecutionContext", () => {
  it("(a) passes when the current binding matches the requested project", async () => {
    bindUserTo("project-ai")
    prismaMock.clientProject.findFirst.mockResolvedValue({
      id: "project-ai",
      name: "AI商业顾问",
      status: "active",
    })

    await expect(
      assertAccountProjectExecutionContext({
        userId: "user-1",
        projectId: "project-ai",
        source: "remote",
      }),
    ).resolves.toEqual({ id: "project-ai", name: "AI商业顾问", status: "active" })
    expect(prismaMock.clientProject.findFirst).toHaveBeenCalledWith({
      where: { id: "project-ai", userId: "user-1", status: "active" },
      select: { id: true, name: true, status: true },
    })
  })

  it("(b) rejects with PROJECT_CONTEXT_MISMATCH when requested != bound", async () => {
    bindUserTo("project-ai")

    await expect(
      assertAccountProjectExecutionContext({
        userId: "user-1",
        projectId: "project-heating",
        source: "remote",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_CONTEXT_MISMATCH", status: 409 })
    expect(prismaMock.clientProject.findFirst).not.toHaveBeenCalled()
  })

  it("(c) rejects with BOUND_PROJECT_UNAVAILABLE when the bound project is inactive/missing", async () => {
    bindUserTo("project-old")
    prismaMock.clientProject.findFirst.mockResolvedValue(null)

    await expect(
      assertAccountProjectExecutionContext({
        userId: "user-1",
        projectId: "project-old",
        source: "background",
      }),
    ).rejects.toMatchObject({ code: "BOUND_PROJECT_UNAVAILABLE", status: 409 })
  })

  it("is a thin wrapper over resolveBoundProject (no duplicated binding rule)", () => {
    // The guard must route through resolveBoundProject, which throws the typed
    // error class; the same error is surfaced (not a re-implemented one).
    const err = new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "x")
    expect(isAccountProjectContextError(err)).toBe(true)
    expect(err.code).toBe("PROJECT_CONTEXT_MISMATCH")
    expect(ACCOUNT_PROJECT_CONTEXT_STALE).toBe("ACCOUNT_PROJECT_CONTEXT_STALE")
  })
})

// ---------------------------------------------------------------------------
// (d) Workers must not run the model / consume quota / mark success on reject
// ---------------------------------------------------------------------------
describe("remote invocation worker", () => {
  it("does NOT executeAimRun or mark the task succeeded when the guard rejects", async () => {
    // Account is bound to a different project than the invocation's projectId.
    bindUserTo("bound-proj")
    prismaMock.clientProject.findFirst.mockResolvedValue(null)
    prismaMock.agentInvocation.findUnique.mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      projectId: "task-proj",
      agentId: "agent-1",
      rawInput: "customer content should never be logged",
      targetFormats: ["video_script"],
      instruction: null,
      apiKey: { id: "key-1", status: "active" },
    })

    const ok = await executeRemoteInvocationBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(executeAimRunMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
    // Invocation was failed with the stable stale code.
    const invocationUpdate = prismaMock.agentInvocation.update.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>
    }
    expect(invocationUpdate.data?.status).toBe("failed")
    expect(invocationUpdate.data?.errorCode).toBe(ACCOUNT_PROJECT_CONTEXT_STALE)
  })

  it("logs only safe identifiers — never customer content", async () => {
    bindUserTo("bound-proj")
    prismaMock.agentInvocation.findUnique.mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      projectId: "task-proj",
      agentId: "agent-1",
      rawInput: "CUSTOMER_SECRET_CONTENT_xyz",
      targetFormats: [],
      instruction: null,
      apiKey: { id: "key-1", status: "active" },
    })

    await executeRemoteInvocationBackgroundTask("task-1")

    const entries = consoleErrorSpy.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(entries.length).toBe(1)
    expect(entries[0]).toMatchObject({
      source: "remote",
      taskId: "task-1",
      userId: "user-1",
      expectedProjectId: "task-proj",
      boundProjectId: "bound-proj",
      code: "PROJECT_CONTEXT_MISMATCH",
    })
    // The safe log must never include customer content.
    expect(JSON.stringify(entries[0])).not.toContain("CUSTOMER_SECRET_CONTENT_xyz")
  })

  it("rejects are NOT retried (task lands in failed, not retry_wait)", async () => {
    // Higher maxAttempts would allow retries for recoverable errors; a stale
    // account-project binding must NOT be retried even with attempts left.
    prismaMock.backgroundTask.findUnique.mockResolvedValue(makeTask({ maxAttempts: 3 }))
    bindUserTo("bound-proj")
    prismaMock.agentInvocation.findUnique.mockResolvedValue({
      id: "inv-2",
      userId: "user-2",
      projectId: "task-proj-2",
      agentId: "agent-2",
      rawInput: "x",
      targetFormats: [],
      instruction: null,
      apiKey: { id: "key-2", status: "active" },
    })

    await executeRemoteInvocationBackgroundTask("task-2")

    // The task must be forced to failed (not parked in retry_wait) and carry the
    // stable stale error code.
    const bgCalls = prismaMock.backgroundTask.updateMany.mock.calls
    const failCall = bgCalls.find((c) => {
      const data = (c[0] as { data?: Record<string, unknown> })?.data
      return data && data.status === "failed"
    })
    expect(failCall).toBeTruthy()
    const failData = (failCall![0] as { data?: { status?: string; lastError?: string } }).data
    expect(failData?.status).toBe("failed")
    expect(failData?.lastError).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)
    // And no retry_wait was scheduled for this task.
    const retryWaitCall = bgCalls.some((c) => {
      const data = (c[0] as { data?: Record<string, unknown> })?.data
      return data?.status === "retry_wait"
    })
    expect(retryWaitCall).toBe(false)
  })
})

describe("newsroom pipeline worker", () => {
  it("does NOT generateAimContent or mark the task succeeded when the guard rejects", async () => {
    bindUserTo("bound-proj")
    // Without the guard, runNewsroomPipeline would reach the model call.
    getMaterialAnchorsMock.mockReturnValue({
      collectionId: undefined,
      theme: "主题",
      samples: [
        { id: "s1", index: 1, platform: "douyin", sourceId: "x", sourceUrl: "https://x", title: "t", authorName: "" },
      ],
      candidateTopics: [],
      mustCite: ["s1"],
      avoidCopy: [],
      groundingPolicy: {},
      sampleReferences: undefined,
    })
    generateAimContentMock.mockResolvedValue({
      results: [{ format: "video_script", content: "draft" }],
    })
    prismaMock.aimGeneration.findUnique.mockResolvedValue({
      userId: "user-1",
      projectId: "newsroom-proj",
      taskSpec: null,
    })

    const ok = await executeNewsroomPipelineBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(generateAimContentMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
  })

  it("quarantines a legacy null-project generation task (stale, not retried, no model call)", async () => {
    bindUserTo("bound-proj")
    // A pre-scoping generation row carries projectId = null: after the account is
    // bound there is NO verifiable project boundary — resolveBoundProject would
    // otherwise let it through by resolving to the CURRENT binding.
    prismaMock.aimGeneration.findUnique.mockResolvedValue({
      userId: "user-1",
      projectId: null,
      taskSpec: null,
    })

    const ok = await executeNewsroomPipelineBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(generateAimContentMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
    expect(taskFailCallData()?.status).toBe("failed")
    expect(taskFailCallData()?.lastError).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)
    expect(wasTaskRetryWaiting()).toBe(false)
    // Safe, content-free log: source + task id + user id + stable code only.
    const entries = consoleErrorSpy.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(entries[0]).toEqual({
      source: "newsroom",
      taskId: "task-1",
      userId: "user-1",
      expectedProjectId: null,
      boundProjectId: null,
      code: ACCOUNT_PROJECT_CONTEXT_STALE,
    })
  })
})

describe("inspiration background worker", () => {
  it("does NOT processInspiration or mark the task succeeded when the guard rejects", async () => {
    bindUserTo("bound-proj")
    prismaMock.inspiration.findUniqueOrThrow.mockResolvedValue({
      userId: "user-1",
      projectId: "insp-proj",
    })

    const ok = await executeInspirationBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(processInspirationMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
  })

  it("quarantines a legacy null-project inspiration task (stale, not retried, no processing)", async () => {
    bindUserTo("bound-proj")
    prismaMock.inspiration.findUniqueOrThrow.mockResolvedValue({
      userId: "user-1",
      projectId: null,
    })

    const ok = await executeInspirationBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(processInspirationMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
    expect(taskFailCallData()?.status).toBe("failed")
    expect(taskFailCallData()?.lastError).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)
    expect(wasTaskRetryWaiting()).toBe(false)
    const entries = consoleErrorSpy.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(entries[0]).toEqual({
      source: "inspiration",
      taskId: "task-1",
      userId: "user-1",
      expectedProjectId: null,
      boundProjectId: null,
      code: ACCOUNT_PROJECT_CONTEXT_STALE,
    })
  })
})

describe("inspiration pipeline background worker", () => {
  it("does NOT processInspirationPipeline or mark the task succeeded when the guard rejects", async () => {
    bindUserTo("bound-proj")
    prismaMock.inspiration.findUnique.mockResolvedValue({
      userId: "user-1",
      projectId: "pipe-proj",
      source: "douyin",
      externalChatId: "chat-1",
      externalMessageId: "msg-1",
      externalAccountId: "acc-1",
    })

    const ok = await executeInspirationPipelineBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(processInspirationPipelineMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
  })

  it("quarantines a legacy null-project inspiration pipeline task (stale, not retried, no processing)", async () => {
    bindUserTo("bound-proj")
    prismaMock.inspiration.findUnique.mockResolvedValue({
      userId: "user-1",
      projectId: null,
      source: "douyin",
      externalChatId: "chat-1",
      externalMessageId: "msg-1",
      externalAccountId: "acc-1",
    })

    const ok = await executeInspirationPipelineBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(processInspirationPipelineMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSuccess()).toBe(false)
    expect(taskFailCallData()?.status).toBe("failed")
    expect(taskFailCallData()?.lastError).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)
    expect(wasTaskRetryWaiting()).toBe(false)
    const entries = consoleErrorSpy.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(entries[0]).toEqual({
      source: "inspiration",
      taskId: "task-1",
      userId: "user-1",
      expectedProjectId: null,
      boundProjectId: null,
      code: ACCOUNT_PROJECT_CONTEXT_STALE,
    })
  })
})
