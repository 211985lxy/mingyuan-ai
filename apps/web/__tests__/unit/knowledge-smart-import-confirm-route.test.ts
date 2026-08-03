import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  create: vi.fn(),
  ensureEmbedding: vi.fn().mockResolvedValue(undefined),
  extractEntities: vi.fn().mockResolvedValue(undefined),
  enforceLimit: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/user-auth", () => ({
  withUserAuth:
    (
      handler: (
        request: NextRequest,
        context: { user: { id: string; email: string } },
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(request, { user: { id: "user-1", email: "user@example.com" } }),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findFirst: (...args: unknown[]) => mocks.findFirst(...args) },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
    knowledgeEntry: { create: (...args: unknown[]) => mocks.create(...args) },
  },
}))

vi.mock("@/lib/llm/embeddings", () => ({
  ensureKnowledgeEmbedding: (...args: unknown[]) => mocks.ensureEmbedding(...args),
}))

vi.mock("@/lib/knowledge-entity-extractor", () => ({
  extractAndPersistForEntry: (...args: unknown[]) => mocks.extractEntities(...args),
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceKnowledgeBetaLimit: (...args: unknown[]) => mocks.enforceLimit(...args),
}))

import { POST } from "@/app/api/knowledge/smart-import/confirm/route"

function request(body: unknown) {
  return new NextRequest("http://localhost/api/knowledge/smart-import/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/knowledge/smart-import/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enforceLimit.mockResolvedValue(null)
    mocks.create.mockReturnValue({ operation: "create" })
    mocks.transaction.mockResolvedValue([
      {
        id: "entry-1",
        userId: "user-1",
        projectId: "project-1",
        content: "客户真实问题",
      },
    ])
  })

  it("rejects missing project id", async () => {
    const response = await POST(
      request({
        entries: [{ title: "a", content: "b", category: "customer_pain", tags: [] }],
      }) as never,
      undefined as never,
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "请选择归属全案" })
  })

  it("returns 404 for project not owned by user", async () => {
    mocks.findFirst.mockResolvedValue(null)
    const response = await POST(
      request({
        projectId: "project-x",
        entries: [{ title: "a", content: "b", category: "customer_pain", tags: [] }],
      }) as never,
      undefined as never,
    )
    expect(response.status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("creates entries as the logged-in user and queues side effects", async () => {
    mocks.findFirst.mockResolvedValue({ id: "project-1" })

    const response = await POST(
      request({
        projectId: "project-1",
        // spoofed userId must be ignored
        userId: "attacker",
        entries: [
          {
            title: "客户问题",
            content: "客户真实问题",
            category: "customer_pain",
            tags: ["客户原话"],
            valueGrade: "A",
          },
        ],
      }) as never,
      undefined as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: { created: 1 } })
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        projectId: "project-1",
        sourceType: "smart_import",
        title: "客户问题",
        content: "客户真实问题",
      }),
    })
    expect(mocks.ensureEmbedding).toHaveBeenCalledWith("entry-1")
    expect(mocks.extractEntities).toHaveBeenCalledWith("entry-1", "客户真实问题", {
      userId: "user-1",
      projectId: "project-1",
    })
  })
})
