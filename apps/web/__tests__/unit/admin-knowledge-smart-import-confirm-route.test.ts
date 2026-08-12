import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  create: vi.fn(),
  ensureEmbedding: vi.fn().mockResolvedValue(undefined),
  extractEntities: vi.fn().mockResolvedValue(undefined),
  enforceLimit: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminOrEditor: (handler: any) => handler,
  withAdminOnly: (handler: (request: NextRequest) => Promise<Response>) => handler,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
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

import { POST } from "@/app/api/admin/knowledge/smart-import/confirm/route"

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/knowledge/smart-import/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("smart-import confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enforceLimit.mockResolvedValue(null)
    mocks.create.mockReturnValue({ operation: "create" })
    mocks.transaction.mockResolvedValue([{
      id: "entry-1",
      userId: "user-1",
      projectId: "project-1",
      content: "客户真实问题",
    }])
  })

  it("queues embedding and entity extraction for every created entry", async () => {
    const response = await POST(
      request({
        userId: "user-1",
        projectId: "project-1",
        entries: [{
          title: "客户问题",
          content: "客户真实问题",
          category: "customer_pain",
          tags: ["客户原话"],
        }],
      }),
      { params: Promise.resolve({}) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: { created: 1 } })
    expect(mocks.ensureEmbedding).toHaveBeenCalledWith("entry-1")
    expect(mocks.extractEntities).toHaveBeenCalledWith(
      "entry-1",
      "客户真实问题",
      { userId: "user-1", projectId: "project-1" },
    )
  })
})
