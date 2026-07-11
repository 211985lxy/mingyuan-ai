import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateAgentRequest: vi.fn(),
  assertAgentProjectAccess: vi.fn(),
  agentAuthErrorResponse: vi.fn(() => null),
  processChunksForSmartImport: vi.fn(),
  enforceKnowledgeBetaLimit: vi.fn(),
  ensureKnowledgeEmbedding: vi.fn(),
  transaction: vi.fn(),
  knowledgeCreate: vi.fn(),
  apiKeyUpdate: vi.fn(),
  callLogCreate: vi.fn(),
}))

vi.mock("@/lib/agent-api-auth", () => ({
  authenticateAgentRequest: mocks.authenticateAgentRequest,
  assertAgentProjectAccess: mocks.assertAgentProjectAccess,
  agentAuthErrorResponse: mocks.agentAuthErrorResponse,
}))
vi.mock("@/lib/knowledge-auto-processor", () => ({ processChunksForSmartImport: mocks.processChunksForSmartImport }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceKnowledgeBetaLimit: mocks.enforceKnowledgeBetaLimit }))
vi.mock("@/lib/llm/embeddings", () => ({ ensureKnowledgeEmbedding: mocks.ensureKnowledgeEmbedding }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    knowledgeEntry: { create: mocks.knowledgeCreate },
    agentApiKey: { update: mocks.apiKeyUpdate },
    agentApiCallLog: { create: mocks.callLogCreate },
  },
}))

import { POST as confirm } from "@/app/api/agent/v1/knowledge/wechat-chat/confirm/route"
import { POST as preview } from "@/app/api/agent/v1/knowledge/wechat-chat/import/route"

const context = { apiKeyId: "key-1", userId: "user-1", allowedProjects: ["project-1"], allowedAgents: [] }
const validEntry = {
  title: "客户担心交付效果",
  content: "客户在签约前最关注交付结果和兑现方式。",
  category: "customer_pain",
  tags: ["kb_scope:project", "asset_role:pain"],
  valueGrade: "A",
}

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) })
}

describe("agent wechat chat knowledge routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateAgentRequest.mockResolvedValue(context)
    mocks.enforceKnowledgeBetaLimit.mockResolvedValue(null)
    mocks.ensureKnowledgeEmbedding.mockResolvedValue(undefined)
    mocks.transaction.mockResolvedValue([{ id: "entry-1" }])
    mocks.apiKeyUpdate.mockResolvedValue({})
    mocks.callLogCreate.mockResolvedValue({})
  })

  it("rejects invalid confirmed knowledge before it can write", async () => {
    const response = await confirm(request("/api/agent/v1/knowledge/wechat-chat/confirm", {
      projectId: "project-1",
      entries: [{ ...validEntry, category: "invented_category" }],
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "知识分类不合法" })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("writes only valid confirmed entries in an authorized project", async () => {
    const response = await confirm(request("/api/agent/v1/knowledge/wechat-chat/confirm", {
      projectId: "project-1",
      entries: [validEntry],
    }))

    expect(response.status).toBe(200)
    expect(mocks.assertAgentProjectAccess).toHaveBeenCalledWith(context, "project-1")
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.knowledgeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        projectId: "project-1",
        category: "customer_pain",
        sourceType: "smart_import",
      }),
    })
  })

  it("rejects oversized chat text before calling the processor", async () => {
    const response = await preview(request("/api/agent/v1/knowledge/wechat-chat/import", {
      projectId: "project-1",
      rawText: "x".repeat(50_001),
    }))

    expect(response.status).toBe(400)
    expect(mocks.processChunksForSmartImport).not.toHaveBeenCalled()
  })

  it("does not write when the project scope is denied", async () => {
    mocks.assertAgentProjectAccess.mockImplementationOnce(() => { throw new Error("AGENT_PROJECT_FORBIDDEN") })
    mocks.agentAuthErrorResponse.mockReturnValueOnce(NextResponse.json({ error: "Project is not allowed for this API key" }, { status: 403 }))

    const response = await confirm(request("/api/agent/v1/knowledge/wechat-chat/confirm", {
      projectId: "other-project",
      entries: [validEntry],
    }))

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
