import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TextEncoder } from "node:util"

import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// WP-12 Commit A：把仅做源码字符串断言的 isolation 测试扩展为行为测试（保留原断言）。
// 钉死契约：认证、quota、messages 校验、toolAction 分支委托、非流式响应字段、
// 流式响应形态、fire-and-forget 记忆沉淀、项目隔离的源码契约。

const {
  authenticateRequest,
  authErrorResponse,
  enforceDailyBetaLimit,
  handleLarkToolAction,
  resolveAimConversationIntent,
  buildAimKnowledgeContext,
  buildAimCompetitorWatchContext,
  getStyleProfileBlock,
  formatEditorContextForPrompt,
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  persistMemoriesFromConversation,
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
  executeAimRun,
  streamAimRun,
  executeAimChatDomain,
  streamAimChatDomain,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  enforceDailyBetaLimit: vi.fn(),
  handleLarkToolAction: vi.fn(),
  resolveAimConversationIntent: vi.fn(async () => ({
    mode: "chat",
    reason: "test",
    confidence: 1,
    useKnowledge: false,
    useMethodology: false,
    useLongTermMemory: false,
    useStyleProfile: false,
  })),
  buildAimKnowledgeContext: vi.fn(async () => ({ knowledgeBlock: "", entries: [], source: "skipped" })),
  buildAimCompetitorWatchContext: vi.fn(async () => ""),
  getStyleProfileBlock: vi.fn(async () => ""),
  formatEditorContextForPrompt: vi.fn(async () => ""),
  retrieveAimMemory: vi.fn(async () => []),
  retrieveLayeredAimMemory: vi.fn(async () => []),
  formatAimMemoryBlock: vi.fn(() => ""),
  persistMemoriesFromConversation: vi.fn(async () => undefined),
  resolveAimRuntimeTask: vi.fn(() => "new_copy"),
  shouldUseKnowledgeContextForTask: vi.fn(() => false),
  shouldUseMarketViralContextForTask: vi.fn(() => false),
  executeAimRun: vi.fn(),
  streamAimRun: vi.fn(),
  executeAimChatDomain: vi.fn(),
  streamAimChatDomain: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceDailyBetaLimit }))
vi.mock("@/lib/aim-tool-actions", () => ({ handleLarkToolAction }))
vi.mock("@/lib/aim-knowledge-context", () => ({ buildAimKnowledgeContext }))
vi.mock("@/lib/aim-competitor-watch-context", () => ({ buildAimCompetitorWatchContext }))
vi.mock("@/lib/aim-knowledge-strategy", () => ({
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
}))
vi.mock("@/lib/style-profile", () => ({ getStyleProfileBlock }))
vi.mock("@/lib/aim-editor", () => ({ formatEditorContextForPrompt }))
vi.mock("@/lib/aim-conversation-intent", () => ({ resolveAimConversationIntent }))
vi.mock("@/lib/aim-memory", () => ({
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  persistMemoriesFromConversation,
}))
vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  finishAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace: unknown, _key: string, _label: string, fn: () => unknown) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))
vi.mock("@/lib/aim-harness/runtime", () => ({ executeAimRun, streamAimRun }))
vi.mock("@/lib/aim-harness/domain-executor", () => ({ executeAimChatDomain, streamAimChatDomain }))
vi.mock("@/lib/aim-harness/hashing", () => ({ sha256: vi.fn(() => "hash") }))

import { POST } from "@/app/api/aim/chat/route"

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/aim/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("aim chat route project isolation (source contract)", () => {
  const routePath = join(process.cwd(), "src/app/api/aim/chat/route.ts")
  const source = readFileSync(routePath, "utf8")

  it("项目对话按当前项目读取风格档案", () => {
    expect(source).toContain("getStyleProfileBlock(user.id, projectId || null)")
  })

  it("项目对话只召回项目记忆，不混入全局记忆", () => {
    expect(source).toContain("? retrieveAimMemory({ userId: user.id, projectId, agentId }).catch(() => [])")
    expect(source).toContain(": retrieveLayeredAimMemory({ userId: user.id, projectId, agentId }).catch(() => [])")
  })
})

describe("POST /api/aim/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    enforceDailyBetaLimit.mockResolvedValue(null)
  })

  it("returns 400 when messages array is missing or empty", async () => {
    const res = await POST(makeRequest({ agentId: "content_producer", projectId: "p1" }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("请求格式不正确，缺少 messages 数组")
  })

  it("returns the quota response unchanged when the daily limit is hit", async () => {
    const quota = new Response(JSON.stringify({ error: "超额" }), { status: 429 })
    enforceDailyBetaLimit.mockResolvedValue(quota)

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "你好" }] }))

    expect(res.status).toBe(429)
    // quota 命中后不应进入 harness
    expect(executeAimRun).not.toHaveBeenCalled()
    expect(streamAimRun).not.toHaveBeenCalled()
  })

  it("delegates tool actions and requires a project", async () => {
    // 缺 projectId → 400
    const missing = await POST(makeRequest({ toolAction: "lark_xxx", messages: [{ role: "user", content: "x" }] }))
    expect(missing.status).toBe(400)

    handleLarkToolAction.mockResolvedValue({ ok: true, summary: "已执行" })
    const res = await POST(makeRequest({ toolAction: "lark_xxx", projectId: "p1", resultId: "r1", messages: [{ role: "user", content: "x" }] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(handleLarkToolAction).toHaveBeenCalledWith("lark_xxx", { userId: "user-1", projectId: "p1", resultId: "r1" })
    expect(body).toEqual({ ok: true, summary: "已执行" })
  })

  it("non-streaming chat returns content + additive harness diagnostics and persists memory", async () => {
    executeAimRun.mockResolvedValue({
      output: "模型回复正文",
      metadata: { runId: "run_test", degraded: false, provider: "test-provider", model: "test-model" },
    })

    const res = await POST(makeRequest({
      agentId: "content_producer",
      projectId: "p1",
      messages: [{ role: "user", content: "写一段" }],
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      content: "模型回复正文",
      runId: "run_test",
      degraded: false,
      provider: "test-provider",
      model: "test-model",
    })

    // 非流式 + projectId + agentId → fire-and-forget 沉淀记忆
    expect(executeAimRun).toHaveBeenCalledTimes(1)
    // 给 fire-and-forget 一次机会落定
    await Promise.resolve()
    expect(persistMemoriesFromConversation).toHaveBeenCalledTimes(1)
  })

  it("streaming chat returns a text/plain stream with the run id header", async () => {
    async function* chunks() {
      yield "段一"
      yield "段二"
    }
    streamAimRun.mockResolvedValue({
      runId: "run_stream",
      spec: {},
      stream: () => chunks(),
      finalize: vi.fn(async () => undefined),
    })
    streamAimChatDomain.mockReturnValue(chunks())

    const res = await POST(makeRequest({
      agentId: "content_producer",
      projectId: "p1",
      stream: true,
      messages: [{ role: "user", content: "流式" }],
    }))

    expect(res.headers.get("Content-Type")).toContain("text/plain")
    expect(res.headers.get("X-AIM-Run-Id")).toBe("run_stream")

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let collected = ""
    // drain the stream so finalize / memory fire
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      collected += decoder.decode(value)
    }
    expect(collected).toBe("段一段二")
    expect(streamAimRun).toHaveBeenCalledTimes(1)
  })

  it("surfaces auth errors with their status and skips the harness", async () => {
    authenticateRequest.mockRejectedValue(Object.assign(new Error("未登录"), { status: 401 }))
    const authError = new Response(JSON.stringify({ error: "未登录" }), { status: 401 })
    authErrorResponse.mockReturnValue(authError)

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "x" }] }))
    expect(res.status).toBe(401)
    expect(executeAimRun).not.toHaveBeenCalled()
    expect(streamAimRun).not.toHaveBeenCalled()
  })
})

// next/server 的 Response 用 web TextEncoder（node test env 下补齐）
void TextEncoder
