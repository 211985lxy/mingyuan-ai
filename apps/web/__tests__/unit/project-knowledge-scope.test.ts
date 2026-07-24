import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("@/env", () => ({
  env: {
    EMBEDDING_ENABLED: "false",
    EMBEDDING_BASE_URL: undefined,
    EMBEDDING_API_KEY: undefined,
    SILICONFLOW_API_KEY: undefined,
    EMBEDDING_MODEL: undefined,
    EMBEDDING_DIMENSIONS: undefined,
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: { findMany: mocks.findMany },
    knowledgeEmbedding: { findMany: vi.fn() },
  },
}))

const { retrieveRelevantKnowledge } = await import("@/lib/llm/embeddings")

describe("project knowledge retrieval", () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.findMany.mockResolvedValue([])
  })

  it("retrieves only the current project's exclusive knowledge", async () => {
    await retrieveRelevantKnowledge({
      userId: "user-1",
      projectId: "project-1",
      query: "写一条成交文案",
    })

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        status: "active",
        projectId: "project-1",
      }),
    }))
  })

  it("retrieves only unbound global entries in quick mode", async () => {
    await retrieveRelevantKnowledge({
      userId: "user-1",
      projectId: "<no-project>",
      query: "写一条通用文案",
    })

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        status: "active",
        projectId: null,
      }),
    }))
  })
})
