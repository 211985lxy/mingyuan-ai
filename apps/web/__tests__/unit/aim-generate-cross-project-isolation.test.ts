import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * 账号-项目隔离修复回归测试（Task 2）。
 * 每个 AIM 账号只绑定一个客户项目：生成入口只能读取该绑定项目下的已有作品，
 * 且正式 AimExecutionTrace 的 projectId 只能来自服务端解析的绑定项目，绝不能用
 * 客户端传来的不可信 projectId。
 */

const {
  authenticateRequest,
  authErrorResponse,
  enforceDailyBetaLimit,
  resolveBoundProject,
  AccountProjectContextError,
  prisma,
  logAimProjectContextRejection,
  createAimTrace,
  executeAimRun,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  enforceDailyBetaLimit: vi.fn(async () => null),
  resolveBoundProject: vi.fn(),
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code: string
    status: number
    constructor(code: string, message: string, status = 409) {
      super(message)
      this.name = "AccountProjectContextError"
      this.code = code
      this.status = status
    }
  },
  prisma: {
    aimGeneration: { findFirst: vi.fn() },
    aimExecutionTrace: { create: vi.fn() },
  },
  logAimProjectContextRejection: vi.fn(async () => undefined),
  createAimTrace: vi.fn(async () => undefined),
  executeAimRun: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceDailyBetaLimit }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  isAccountProjectContextError: (error: unknown) => error instanceof AccountProjectContextError,
  AccountProjectContextError,
}))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/aim-observability", () => ({
  createAimTrace,
  logAimProjectContextRejection,
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace, _key, _label, fn) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))
vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun: vi.fn(async (request: { runLlmQuality?: boolean }, execute: (spec: unknown) => Promise<{ output: unknown }>) => {
    // 正常路径：调用领域执行器并返回一次可序列化的 run。
    const adapted = await execute({ agentId: "content_producer", runtimeTask: "new_copy" })
    return {
      output: adapted.output,
      metadata: { runId: "run-isolation", degraded: false, provider: "test-provider", model: "test-model" },
      qualityChecks: [],
      qualityStatus: "pass",
      qualityReport: undefined,
    }
  }),
}))
vi.mock("@/lib/aim-generate-context", () => ({
  buildRawInputWithOpportunityBrief: vi.fn((rawInput: string) => rawInput),
  buildRawInputWithMarketViralContext: vi.fn(async (_userId: string, rawInput: string) => rawInput),
  buildRawInputWithVideoCopyContext: vi.fn(async (_userId: string, rawInput: string) => rawInput),
  buildRawInputWithTrendingContext: vi.fn(async (rawInput: string) => rawInput),
  buildRawInputWithCommentInsightContext: vi.fn(async (_userId: string, rawInput: string) => rawInput),
}))

import { POST } from "@/app/api/aim/generate/route"

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/aim/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

const boundProjectA = { id: "project-a", name: "项目A", status: "active" }

describe("POST /api/aim/generate — cross-project isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    enforceDailyBetaLimit.mockResolvedValue(null)
    resolveBoundProject.mockResolvedValue(boundProjectA)
    createAimTrace.mockResolvedValue({ id: "trace-x", startedAt: Date.now() })
  })

  it("Test A: rejects an existingGenerationId that belongs to the same user under a different project", async () => {
    // 用户绑定 project-a；该 existingGenerationId 记录属于同一用户但挂在 project-b 下。
    const crossProjectTaskSpec = { goal: "跨项目目标", knownFacts: [], unknowns: [], assumptions: [] }
    // 模拟查询结果：只有未带项目条件的旧查询才会误命中这条跨项目记录。
    prisma.aimGeneration.findFirst.mockImplementation((args: { where: Record<string, unknown> }) => {
      if (args.where.projectId === "project-a") return null // 修复后：绑定项目下查不到
      return { id: "gen-under-b", userId: "user-1", projectId: "project-b", taskSpec: crossProjectTaskSpec } // 旧实现泄露
    })

    const res = await POST(makeRequest({
      agentId: "content_producer",
      rawInput: "写一条文案",
      targetFormats: ["video_script"],
      projectId: "project-a",
      existingGenerationId: "gen-under-b",
    }))
    const body = await res.json()

    // 必须拒绝，不得视为“没有旧稿”继续生成。
    expect(res.status).toBe(404)
    expect(body.code).toBe("EXISTING_GENERATION_NOT_IN_BOUND_PROJECT")
    // 查询必须用服务端解析的绑定项目，绝不用客户端 project-b。
    expect(prisma.aimGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: "gen-under-b", userId: "user-1", projectId: "project-a" },
      select: { taskSpec: true },
    })
    // 模型不被调用。
    expect(executeAimRun).not.toHaveBeenCalled()
  })

  it("Test B: a mismatched client project is rejected without creating an untrusted trace", async () => {
    // 账号绑定的 project-a，但请求体声明 project-b。
    resolveBoundProject.mockImplementation(async ({ requestedProjectId }: { requestedProjectId?: string | null }) => {
      if (requestedProjectId && requestedProjectId !== "project-a") {
        throw new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "当前账号只能使用已绑定的项目", 409)
      }
      return boundProjectA
    })

    const res = await POST(makeRequest({
      agentId: "content_producer",
      rawInput: "写一条文案",
      targetFormats: ["video_script"],
      projectId: "project-b",
    }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe("PROJECT_CONTEXT_MISMATCH")
    // 拒绝必须记录为安全/审计事件。
    expect(logAimProjectContextRejection).toHaveBeenCalled()
    // 不得创建挂着不可信 project-b 的正式 trace。
    expect(createAimTrace).not.toHaveBeenCalled()
    // 模型不被调用。
    expect(executeAimRun).not.toHaveBeenCalled()
  })
})
