import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// WP-12 Commit A：为 inspiration/[id]/generate 路由钉死行为基线（此前零覆盖）。
// 断言范围：认证、灵感归属隔离（findFirst 带 userId）、projectId 校验、404/400、
// harness 入口（entrypoint inspiration）、inspiration.update 写回、响应字段。

const {
  authenticateRequest,
  authErrorResponse,
  executeAimRun,
  inspirationFindFirst,
  inspirationUpdate,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  executeAimRun: vi.fn(),
  inspirationFindFirst: vi.fn(),
  inspirationUpdate: vi.fn(async () => ({})),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
  authErrorResponse,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspiration: {
      findFirst: inspirationFindFirst,
      update: inspirationUpdate,
    },
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
}))

import { POST } from "@/app/api/inspiration/[id]/generate/route"

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inspiration/insp-1/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

const ctx = { id: "insp-1" } as never

describe("POST /api/inspiration/[id]/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    executeAimRun.mockResolvedValue({
      output: { id: "gen-1", results: [{ format: "video_script", content: "正文", wordCount: 2 }] },
      metadata: { runId: "run_test", degraded: false, provider: "test-provider", model: "test-model" },
    })
  })

  it("returns 404 when inspiration does not exist for the user (ownership isolation)", async () => {
    inspirationFindFirst.mockResolvedValue(null)

    const res = await POST(makeRequest({ projectId: "p1" }), { params: Promise.resolve(ctx) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("灵感记录不存在")
    // 归属隔离：findFirst 必须按 id + userId 过滤
    expect(inspirationFindFirst).toHaveBeenCalledWith({ where: { id: "insp-1", userId: "user-1" } })
    expect(executeAimRun).not.toHaveBeenCalled()
  })

  it("returns 400 when projectId is missing", async () => {
    inspirationFindFirst.mockResolvedValue({ id: "insp-1", content: "灵感内容" })

    const res = await POST(makeRequest({}), { params: Promise.resolve(ctx) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("请选择 IP 营销全案")
  })

  it("returns 200, runs the harness with entrypoint inspiration and writes back the result", async () => {
    inspirationFindFirst.mockResolvedValue({ id: "insp-1", content: "灵感内容" })

    const res = await POST(makeRequest({ projectId: "p1", topicTitle: "选题A" }), { params: Promise.resolve(ctx) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({
      id: "gen-1",
      runId: "run_test",
      degraded: false,
      provider: "test-provider",
      model: "test-model",
    }))

    // harness 入口契约
    const [request] = executeAimRun.mock.calls[0]
    expect(request.entrypoint).toBe("inspiration")
    expect(request.agentId).toBe("content_producer")
    expect(request.rawInput).toBe("灵感内容")
    expect(request.taskType).toBe("write_script")
    expect(request.topicTitle).toBe("选题A")
    expect(request.runLlmQuality).toBe(false)

    // 固定三元组
    expect(request.targetFormats).toEqual(["video_script", "shooting_brief", "moments_post"])

    // 回写：generatedContent + aimGenerationId
    expect(inspirationUpdate).toHaveBeenCalledWith({
      where: { id: "insp-1" },
      data: expect.objectContaining({ aimGenerationId: "gen-1" }),
    })
  })

  it("returns 500 and surfaces auth errors when authentication fails", async () => {
    authenticateRequest.mockRejectedValue(Object.assign(new Error("未登录"), { status: 401 }))
    const authError = new Response(JSON.stringify({ error: "未登录" }), { status: 401 })
    authErrorResponse.mockReturnValue(authError)

    const res = await POST(makeRequest({ projectId: "p1" }), { params: Promise.resolve(ctx) })
    expect(res.status).toBe(401)
    expect(inspirationFindFirst).not.toHaveBeenCalled()
  })
})
