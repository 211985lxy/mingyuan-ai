import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  authErrorResponse,
  resolveBoundProject,
  findMany,
  create,
  enforceKnowledgeBetaLimit,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  resolveBoundProject: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  enforceKnowledgeBetaLimit: vi.fn(async () => null),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { knowledgeEntry: { findMany, create } } }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceKnowledgeBetaLimit }))
vi.mock("@/lib/llm/embeddings", () => ({ ensureKnowledgeEmbedding: vi.fn(async () => undefined) }))
vi.mock("@/lib/knowledge-entity-extractor", () => ({ extractAndPersistForEntry: vi.fn(async () => undefined) }))

import { GET, POST } from "@/app/api/knowledge/route"

function makeRequest(method: string, body?: Record<string, unknown>, url = "http://localhost/api/knowledge") {
  return new NextRequest(url, {
    method,
    ...(body ? {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    } : {}),
  })
}

describe("knowledge account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    resolveBoundProject.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })
    findMany.mockResolvedValue([])
    create.mockResolvedValue({ id: "entry-1", projectId: "project-ai" })
    enforceKnowledgeBetaLimit.mockResolvedValue(null)
  })

  it("reads only the account-bound project, including other authorized members' knowledge", async () => {
    const response = await GET(makeRequest("GET", undefined, "http://localhost/api/knowledge?projectId=project-other"))
    expect(response.status).toBe(200)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: "project-other" })
    const where = findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ projectId: "project-ai" })
    expect(where).not.toHaveProperty("userId")
  })

  it("automatically assigns new knowledge to the bound project", async () => {
    const response = await POST(makeRequest("POST", {
      category: "user_insight",
      title: "客户反馈",
      content: "客户更关注结果",
    }))
    expect(response.status).toBe(201)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: undefined })
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "user-1",
      projectId: "project-ai",
    }) })
  })
})
