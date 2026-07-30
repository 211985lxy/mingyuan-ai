/**
 * POST /api/aim/chat 的技能跨引擎委托行为。
 *
 * 钉死：委托只换执行引擎（handler / 模型链 / 知识策略 / 知识分类），
 * 会话归属（记忆写入的 agentId）与非委托路径的行为保持不变。
 */
import { TextEncoder } from "node:util"

import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

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
  resolvePainPointIntent,
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
  executeAimRun,
  streamAimRun,
  executeAimChatDomain,
  streamAimChatDomain,
  ownsActiveProject,
  addAimTraceStep,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn((): Response | null => null),
  enforceDailyBetaLimit: vi.fn(),
  handleLarkToolAction: vi.fn(),
  resolveAimConversationIntent: vi.fn(async () => ({
    mode: "chat",
    reason: "test",
    confidence: 1,
    useKnowledge: true,
    useMethodology: false,
    useLongTermMemory: true,
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
  resolvePainPointIntent: vi.fn(async () => null),
  resolveMethodologyPolicy: vi.fn(async () => ({ versionRows: [] })),
  buildMethodologyProfileBlock: vi.fn(() => ""),
  executeAimRun: vi.fn(),
  streamAimRun: vi.fn(),
  executeAimChatDomain: vi.fn(),
  streamAimChatDomain: vi.fn(),
  ownsActiveProject: vi.fn(async () => true),
  addAimTraceStep: vi.fn(async () => undefined),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceDailyBetaLimit }))
vi.mock("@/lib/aim-tool-actions", () => ({ handleLarkToolAction }))
vi.mock("@/lib/aim-knowledge-context", () => ({ buildAimKnowledgeContext }))
vi.mock("@/lib/aim-competitor-watch-context", () => ({ buildAimCompetitorWatchContext }))
vi.mock("@/lib/style-profile", () => ({ getStyleProfileBlock }))
vi.mock("@/lib/aim-editor", () => ({ formatEditorContextForPrompt }))
vi.mock("@/lib/aim-conversation-intent", () => ({ resolveAimConversationIntent }))
vi.mock("@/lib/aim-pain-intent", () => ({
  resolvePainPointIntent,
  enrichKnowledgeQueryWithPainIntent: (query: string) => query,
  mergePainIntentIntoKnowledgeContext: (input: { knowledgeBlock: string; entries: unknown[] }) => ({
    knowledgeBlock: input.knowledgeBlock,
    entries: input.entries,
  }),
}))
vi.mock("@/lib/methodology-profile-store", () => ({
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
}))
vi.mock("@/lib/aim-memory", () => ({
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  persistMemoriesFromConversation,
}))
vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep,
  failAimTrace: vi.fn(async () => undefined),
  finishAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace: unknown, _key: string, _label: string, fn: () => unknown) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))
vi.mock("@/lib/aim-harness/runtime", () => ({ executeAimRun, streamAimRun }))
vi.mock("@/lib/aim-harness/domain-executor", () => ({ executeAimChatDomain, streamAimChatDomain }))
vi.mock("@/lib/resource-ownership", () => ({ ownsActiveProject }))

import { POST } from "@/app/api/aim/chat/route"

const REVIEW_SKILL_PROMPT = "请基于当前文案做标题质检：指出标题是否准确、有钩子、是否夸大或违规。"

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/aim/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

/** executeAimRun 真身会把 request.agentId 冻进 spec；这里等价模拟到 domain 端口。 */
function stubHarnessRun() {
  executeAimRun.mockImplementation(async (request: Record<string, unknown>, execute: (spec: unknown) => Promise<unknown>) => {
    await execute({
      agentId: request.agentId,
      runtimeTask: request.runtimeTask,
      modelPolicy: { agentId: request.agentId, routeKey: request.agentModule ? `copy_studio.${request.agentModule}` : request.agentId },
    })
    return {
      output: "模型回复正文",
      metadata: { runId: "run_1", degraded: false, provider: "p", model: "m" },
    }
  })
  executeAimChatDomain.mockResolvedValue({ output: "模型回复正文" })
}

function workEditorBody(extra: Record<string, unknown> = {}) {
  return {
    agentId: "work_editor",
    projectId: "p1",
    messages: [{ role: "user", content: REVIEW_SKILL_PROMPT }],
    ...extra,
  }
}

describe("POST /api/aim/chat 技能跨引擎委托", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    enforceDailyBetaLimit.mockResolvedValue(null)
    ownsActiveProject.mockResolvedValue(true)
    stubHarnessRun()
  })

  it("质检技能在作品编辑会话里执行时，Harness 用质检引擎", async () => {
    const res = await POST(makeRequest(workEditorBody({ executionAgentId: "content_review" })))
    expect(res.status).toBe(200)

    expect(executeAimRun).toHaveBeenCalledWith(
      expect.objectContaining({ entrypoint: "chat", agentId: "content_review" }),
      expect.any(Function),
    )
    // handler 由 spec.agentId 取；委托后必须是质检
    expect(executeAimChatDomain).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "content_review" }),
      expect.anything(),
      expect.anything(),
    )
  })

  it("委托轮的知识策略走 quality_review，知识分类按质检取", async () => {
    await POST(makeRequest(workEditorBody({ executionAgentId: "content_review" })))

    expect(executeAimRun).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeTask: "quality_review" }),
      expect.any(Function),
    )
    expect(buildAimKnowledgeContext).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "content_review" }),
    )
  })

  it("会话与记忆仍然归属作品编辑，不跟着引擎跳台", async () => {
    await POST(makeRequest(workEditorBody({ executionAgentId: "content_review" })))
    await Promise.resolve()

    expect(retrieveAimMemory).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "work_editor" }),
    )
    expect(persistMemoriesFromConversation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agentId: "work_editor" }),
    )
  })

  it("委托事实写进 trace，非法引擎也留痕", async () => {
    await POST(makeRequest(workEditorBody({ executionAgentId: "content_review" })))
    expect(addAimTraceStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      key: "route_request",
      metadata: expect.objectContaining({
        agentId: "work_editor",
        executionAgentId: "content_review",
        delegatedExecution: true,
        rejectedExecutionAgentId: null,
      }),
    }))

    vi.clearAllMocks()
    stubHarnessRun()
    await POST(makeRequest(workEditorBody({ executionAgentId: "content_reviewer" })))
    expect(addAimTraceStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      key: "route_request",
      metadata: expect.objectContaining({
        executionAgentId: "work_editor",
        delegatedExecution: false,
        rejectedExecutionAgentId: "content_reviewer",
      }),
    }))
  })

  it("非法引擎安全回落到当前智能体，不抛错、不串到默认智能体", async () => {
    const res = await POST(makeRequest(workEditorBody({ executionAgentId: "content_reviewer" })))

    expect(res.status).toBe(200)
    expect(executeAimRun).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "work_editor" }),
      expect.any(Function),
    )
    expect(buildAimKnowledgeContext).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "work_editor" }),
    )
  })

  it("不带引擎字段 / 引擎等于当前智能体时行为完全一致", async () => {
    await POST(makeRequest(workEditorBody()))
    const baseline = executeAimRun.mock.calls[0][0]

    vi.clearAllMocks()
    stubHarnessRun()
    await POST(makeRequest(workEditorBody({ executionAgentId: "work_editor" })))

    expect(executeAimRun.mock.calls[0][0]).toEqual(baseline)
  })

  it("委托轮不把创作台模块带进目标引擎的模型路由", async () => {
    await POST(makeRequest({
      agentId: "content_producer",
      projectId: "p1",
      agentModule: "social",
      messages: [{ role: "user", content: REVIEW_SKILL_PROMPT }],
      executionAgentId: "content_review",
    }))

    expect(executeAimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "content_review",
        agentModule: undefined,
        writerModule: undefined,
      }),
      expect.any(Function),
    )
  })

  it("未委托时创作台模块照常透传", async () => {
    await POST(makeRequest({
      agentId: "content_producer",
      projectId: "p1",
      agentModule: "social",
      messages: [{ role: "user", content: "写一段" }],
    }))

    expect(executeAimRun).toHaveBeenCalledWith(
      expect.objectContaining({ agentModule: "social", writerModule: "social" }),
      expect.any(Function),
    )
  })
})

// next/server 的 Response 用 web TextEncoder（node test env 下补齐）
void TextEncoder
