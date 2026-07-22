import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// WP-12 Commit A：为 agent/v1/aim/generate 路由钉死行为基线（此前零覆盖）。
// 断言范围：认证、quota、输入校验顺序、access 断言顺序、状态码、响应字段、
// writeAgentLog 成功/失败两条记录、harness 被调用。运行时内核与 DB 由独立单测覆盖。

const {
  authenticateAgentRequest,
  assertAgentAccess,
  assertAgentProjectAccess,
  assertAgentScope,
  agentAuthErrorResponse,
  executeAimRun,
  executeAimGenerationDomain,
  agentApiCallLogCreate,
  aimGenerationFindUnique,
  agentApiKeyUpdate,
} = vi.hoisted(() => ({
  authenticateAgentRequest: vi.fn(),
  assertAgentAccess: vi.fn(),
  assertAgentProjectAccess: vi.fn(),
  assertAgentScope: vi.fn(),
  agentAuthErrorResponse: vi.fn((): Response | null => null),
  executeAimRun: vi.fn(),
  executeAimGenerationDomain: vi.fn(async () => ({ output: {}, generationId: "gen-1" })),
  agentApiCallLogCreate: vi.fn(async () => ({})),
  aimGenerationFindUnique: vi.fn(async () => ({ createdAt: new Date("2026-07-14T00:00:00.000Z") })),
  agentApiKeyUpdate: vi.fn(async () => ({})),
}))

vi.mock("@/lib/agent-api-auth", () => ({
  authenticateAgentRequest,
  assertAgentAccess,
  assertAgentProjectAccess,
  assertAgentScope,
  agentAuthErrorResponse,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentApiCallLog: { create: agentApiCallLogCreate },
    aimGeneration: { findUnique: aimGenerationFindUnique },
    agentApiKey: { update: agentApiKeyUpdate },
  },
}))

vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace: unknown, _key: string, _label: string, fn: () => unknown) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))

vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun,
  // route 用它把旧别名（如 ip_video）归一化；真实实现见 contracts.ts，这里直接透传即可。
  normalizeAimAgentId: (id: string) => id,
}))

vi.mock("@/lib/aim-harness/domain-executor", () => ({
  executeAimGenerationDomain,
}))

// AGENT_DENIED_ACTIONS 是常量，保留真实实现即可——route 直接 import 它用于响应。
// parseAgentTargetFormats / findInvalidAgentTargetFormats / summarizeAgentInput 也用真实实现，
// 这样 400 校验路径才是真测试。

import { POST } from "@/app/api/agent/v1/aim/generate/route"

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/agent/v1/aim/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-key", ...headers },
  })
}

describe("POST /api/agent/v1/aim/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateAgentRequest.mockResolvedValue({ apiKeyId: "key-1", userId: "user-1" })
    assertAgentAccess.mockReturnValue(undefined)
    assertAgentProjectAccess.mockReturnValue(undefined)
    assertAgentScope.mockReturnValue(undefined)
    agentAuthErrorResponse.mockReturnValue(null)
    executeAimRun.mockResolvedValue({
      output: { id: "gen-1", results: [{ format: "video_script", content: "正文", wordCount: 2 }] },
      metadata: { runId: "run_test", degraded: false, provider: "test-provider", model: "test-model" },
      qualityStatus: "skipped",
    })
  })

  it("returns 401 when agent authentication fails", async () => {
    const authError = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
    authenticateAgentRequest.mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }))
    agentAuthErrorResponse.mockReturnValue(authError)

    const res = await POST(makeRequest({ rawInput: "x", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"] }))

    expect(res.status).toBe(401)
    // 认证失败发生在写入日志之前：context 仍为 null，不应落 success 日志
    expect(agentApiCallLogCreate).not.toHaveBeenCalled()
  })

  it("returns 400 when rawInput is missing", async () => {
    const res = await POST(makeRequest({ projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("请输入内容")
    // 校验失败：context 已建立，应落 failed 日志（mock 替换的是 prisma create，外层包 data）
    expect(agentApiCallLogCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }))
    expect(executeAimRun).not.toHaveBeenCalled()
  })

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(makeRequest({ rawInput: "x", agentId: "content_producer", targetFormats: ["video_script"] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("请选择 IP 营销全案")
  })

  it("returns 400 when targetFormats is empty", async () => {
    const res = await POST(makeRequest({ rawInput: "x", projectId: "p1", agentId: "content_producer", targetFormats: [] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("请选择至少一种生成格式")
  })

  it("returns 400 for unsupported target formats", async () => {
    // 含一个合法 + 一个非法：parse 得到非空（绕开"至少一种"），findInvalid 命中"不支持的"
    const res = await POST(makeRequest({ rawInput: "x", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script", "bogus_format"] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("不支持的生成格式")
  })

  it("asserts project access before agent access (immutable order)", async () => {
    await POST(makeRequest({ rawInput: "x", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"] }))

    // route.ts:82 assertAgentProjectAccess 先于 route.ts:83 assertAgentAccess
    const order: string[] = []
    assertAgentProjectAccess.mockImplementation(() => { order.push("project") })
    assertAgentAccess.mockImplementation(() => { order.push("agent") })
    await POST(makeRequest({ rawInput: "x", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"] }))
    expect(order).toEqual(["project", "agent"])
  })

  it("returns 200 with additive harness diagnostics and draft-only warnings", async () => {
    const res = await POST(makeRequest({ rawInput: "写一条口播", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({
      id: "gen-1",
      agentId: "content_producer",
      projectId: "p1",
      results: [{ format: "video_script", content: "正文", wordCount: 2 }],
      warnings: ["draft_only"],
      runId: "run_test",
      degraded: false,
      provider: "test-provider",
      model: "test-model",
      qualityStatus: "skipped",
    }))
    expect(Array.isArray(body.deniedActions)).toBe(true)
  })

  it("invokes the harness with entrypoint agent_api and writes a success call log", async () => {
    await POST(makeRequest({ rawInput: "写一条口播", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"], instruction: "更口语" }))

    expect(executeAimRun).toHaveBeenCalledTimes(1)
    const [request] = executeAimRun.mock.calls[0]
    expect(request.entrypoint).toBe("agent_api")
    expect(request.rawInput).toBe("写一条口播")
    expect(request.agentId).toBe("content_producer")
    expect(request.polishInstruction).toBe("更口语")
    expect(request.runLlmQuality).toBe(false)

    expect(agentApiKeyUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "key-1" } }))
    expect(agentApiCallLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "aim.generate",
        status: "success",
        aimGenerationId: "gen-1",
      }),
    }))
  })

  it("writes a failed call log when the harness throws (non-auth error → 400)", async () => {
    executeAimRun.mockRejectedValue(new Error("模型超时"))

    const res = await POST(makeRequest({ rawInput: "x", projectId: "p1", agentId: "content_producer", targetFormats: ["video_script"] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("模型超时")
    expect(agentApiCallLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "failed",
        errorMessage: "模型超时",
      }),
    }))
  })
})
