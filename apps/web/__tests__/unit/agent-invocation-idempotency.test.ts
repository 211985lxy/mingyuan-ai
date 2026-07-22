import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock prisma with a controllable agentInvocation store
const invocationStore = new Map<string, Record<string, unknown>>()
let createdInvocationId = "inv-1"
const mocks = vi.hoisted(() => ({
  agentInvocationFindUnique: vi.fn(),
  agentInvocationCreate: vi.fn(),
  agentInvocationUpdate: vi.fn(),
  enqueueBackgroundTask: vi.fn(),
  transaction: vi.fn(),
  clientProjectFindFirst: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    clientProject: { findFirst: mocks.clientProjectFindFirst },
    agentInvocation: {
      findUnique: mocks.agentInvocationFindUnique,
      create: mocks.agentInvocationCreate,
      update: mocks.agentInvocationUpdate,
    },
  },
}))

vi.mock("@/lib/background-tasks", () => ({ enqueueBackgroundTask: mocks.enqueueBackgroundTask }))
vi.mock("@/lib/agent-api-auth", () => ({
  assertAgentProjectAccess: vi.fn(),
  assertAgentAccess: vi.fn(),
}))
vi.mock("@/lib/agent-token-quota", () => ({
  checkMinuteQuota: vi.fn(async () => ({ allowed: true })),
  assertDailyTokenBudget: vi.fn(),
}))
vi.mock("@/lib/aim-generator", () => ({}))

import { submitInvocation, getInvocation } from "@/lib/aim-remote/invocation-service"
import { REMOTE_ERROR_CODE } from "@/lib/aim-remote/contracts"
import type { AgentApiContext } from "@/lib/agent-api-auth"

function makeContext(): AgentApiContext {
  return {
    apiKeyId: "key-1",
    userId: "user-1",
    allowedProjects: ["proj-1"],
    allowedAgents: [],
    clientType: "codex",
    allowedScopes: [],
    expiresAt: null,
    maxInputChars: 50000,
    minuteLimit: 60,
    dailyTokenLimit: null,
  }
}

function makeInput() {
  return {
    idempotencyKey: "idem-key-001",
    projectId: "proj-1",
    agentId: "content_producer" as never,
    rawInput: "写一条短视频文案",
    targetFormats: ["video_script"] as never,
  }
}

describe("submitInvocation idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invocationStore.clear()
    createdInvocationId = "inv-1"
    mocks.agentInvocationFindUnique.mockResolvedValue(null)
    mocks.clientProjectFindFirst.mockResolvedValue({ id: "proj-1" })
    // Default transaction: runs callback with the mocked prisma methods
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        agentInvocation: {
          create: mocks.agentInvocationCreate,
          update: mocks.agentInvocationUpdate,
        },
      }),
    )
    mocks.agentInvocationCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      const id = createdInvocationId
      createdInvocationId = `inv-${parseInt(id.split("-")[1]) + 1}`
      const record = { ...args.data, id, status: "queued", requestHash: args.data.requestHash }
      invocationStore.set(id, record)
      return record
    })
    mocks.agentInvocationUpdate.mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const rec = invocationStore.get(args.where.id)
      if (rec) invocationStore.set(args.where.id, { ...rec, ...args.data })
      return { count: 1 }
    })
    mocks.enqueueBackgroundTask.mockResolvedValue({ id: "task-1" })
  })

  it("creates an invocation + enqueues a single-attempt background task on first submit", async () => {
    const result = await submitInvocation(makeContext(), makeInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.created).toBe(true)
    expect(result.response.status).toBe("queued")
    expect(mocks.enqueueBackgroundTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxAttempts: 1 }),
    )
  })

  it("returns the SAME invocation (not re-created) when re-submitted with identical request", async () => {
    // First submit
    const first = await submitInvocation(makeContext(), makeInput())
    expect(first.ok).toBe(true)
    // Simulate the row existing in DB now
    const stored = invocationStore.get("inv-1")
    mocks.agentInvocationFindUnique.mockResolvedValue(stored)
    // Clear call history from first submit so assertions only reflect second submit
    mocks.agentInvocationCreate.mockClear()
    mocks.enqueueBackgroundTask.mockClear()

    // Second submit — same idempotency key, same content
    const second = await submitInvocation(makeContext(), makeInput())
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.created).toBe(false)
    expect(second.response.invocationId).toBe("inv-1")
    // Should NOT have created a second invocation or second task
    expect(mocks.agentInvocationCreate).not.toHaveBeenCalled()
    expect(mocks.enqueueBackgroundTask).not.toHaveBeenCalled()
  })

  it("returns IDEMPOTENCY_CONFLICT when same key but different request content", async () => {
    // First submit
    await submitInvocation(makeContext(), makeInput())
    mocks.agentInvocationFindUnique.mockResolvedValue(invocationStore.get("inv-1"))
    mocks.agentInvocationCreate.mockClear()

    // Second submit — same key, DIFFERENT rawInput
    const differentInput = makeInput()
    differentInput.rawInput = "完全不同的文案内容"
    const result = await submitInvocation(makeContext(), differentInput)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe(REMOTE_ERROR_CODE.IDEMPOTENCY_CONFLICT)
  })

  it("rejects input exceeding maxInputChars", async () => {
    const ctx = makeContext()
    ctx.maxInputChars = 10
    const input = makeInput()
    input.rawInput = "这是一段超过十个字符限制的输入内容"
    const result = await submitInvocation(ctx, input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe(REMOTE_ERROR_CODE.INPUT_TOO_LARGE)
  })

  it("rejects empty targetFormats", async () => {
    const input = makeInput()
    input.targetFormats = [] as never
    const result = await submitInvocation(makeContext(), input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe(REMOTE_ERROR_CODE.TOO_MANY_FORMATS)
  })

  it("rejects more than 3 targetFormats", async () => {
    const input = makeInput()
    input.targetFormats = ["video_script", "moments_post", "wechat_article", "raw_copy"] as never
    const result = await submitInvocation(makeContext(), input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errorCode).toBe(REMOTE_ERROR_CODE.TOO_MANY_FORMATS)
  })
})

describe("getInvocation ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the invocation when the requesting key created it", async () => {
    mocks.agentInvocationFindUnique.mockResolvedValue({
      id: "inv-1",
      apiKeyId: "key-1",
      status: "succeeded",
      runId: "run_1",
      aimGenerationId: "gen-1",
      provider: "deepseek",
      model: "deepseek-chat",
      degraded: false,
      inputTokens: 100,
      outputTokens: 200,
      costCny: null,
      errorCode: null,
      errorMessage: null,
    })
    const result = await getInvocation(makeContext(), "inv-1")
    expect(result).not.toBeNull()
    expect(result?.invocationId).toBe("inv-1")
    expect(result?.status).toBe("succeeded")
  })

  it("returns null (forbidden) when the invocation belongs to a different key", async () => {
    mocks.agentInvocationFindUnique.mockResolvedValue({
      id: "inv-1",
      apiKeyId: "key-OTHER", // different key
      status: "succeeded",
      runId: null,
      aimGenerationId: null,
      provider: null,
      model: null,
      degraded: false,
      inputTokens: null,
      outputTokens: null,
      costCny: null,
      errorCode: null,
      errorMessage: null,
    })
    const result = await getInvocation(makeContext(), "inv-1")
    expect(result).toBeNull()
  })

  it("returns null when the invocation does not exist", async () => {
    mocks.agentInvocationFindUnique.mockResolvedValue(null)
    const result = await getInvocation(makeContext(), "missing")
    expect(result).toBeNull()
  })
})
