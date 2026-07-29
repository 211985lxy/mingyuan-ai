import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn<(error: unknown) => NextResponse | null>(() => null),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  projectFindFirst: vi.fn(),
  ensureKnowledgeEmbedding: vi.fn(),
  extractAndPersistForEntry: vi.fn(),
  enforceKnowledgeBetaLimit: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
  authErrorResponse: mocks.authErrorResponse,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
    },
    clientProject: {
      findFirst: mocks.projectFindFirst,
    },
  },
}))

vi.mock("@/lib/llm/embeddings", () => ({
  ensureKnowledgeEmbedding: mocks.ensureKnowledgeEmbedding,
}))

vi.mock("@/lib/knowledge-entity-extractor", () => ({
  extractAndPersistForEntry: mocks.extractAndPersistForEntry,
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceKnowledgeBetaLimit: mocks.enforceKnowledgeBetaLimit,
}))

import { GET as listKnowledge, POST as createKnowledge } from "@/app/api/knowledge/route"
import { GET as getKnowledge, PUT as updateKnowledge, DELETE as archiveKnowledge } from "@/app/api/knowledge/[id]/route"

function jsonRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(url, init)
}

describe("customer knowledge API ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({ id: "user-a" })
    mocks.authErrorResponse.mockReturnValue(null)
    mocks.enforceKnowledgeBetaLimit.mockResolvedValue(null)
    mocks.ensureKnowledgeEmbedding.mockReturnValue(Promise.resolve())
    mocks.extractAndPersistForEntry.mockReturnValue(Promise.resolve())
  })

  it("lists only the current user's entries", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "k1", userId: "user-a", title: "我的资料" }])
    const response = await listKnowledge(jsonRequest("http://localhost/api/knowledge?status=active"))
    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-a", status: "active" }),
    }))
  })

  it("returns 401 when unauthenticated", async () => {
    mocks.authenticateRequest.mockRejectedValueOnce(new Error("UNAUTHORIZED"))
    mocks.authErrorResponse.mockReturnValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    )
    const response = await listKnowledge(jsonRequest("http://localhost/api/knowledge"))
    expect(response.status).toBe(401)
  })

  it("cannot read another user's knowledge id", async () => {
    mocks.findFirst.mockResolvedValueOnce(null)
    const response = await getKnowledge(
      jsonRequest("http://localhost/api/knowledge/kb-b"),
      { params: Promise.resolve({ id: "kb-b" }) },
    )
    expect(response.status).toBe(404)
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "kb-b", userId: "user-a" },
    })
  })

  it("cannot edit another user's knowledge id", async () => {
    mocks.findFirst.mockResolvedValueOnce(null)
    const response = await updateKnowledge(
      jsonRequest("http://localhost/api/knowledge/kb-b", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "偷改" }),
      }),
      { params: Promise.resolve({ id: "kb-b" }) },
    )
    expect(response.status).toBe(404)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("cannot archive another user's knowledge id", async () => {
    mocks.findFirst.mockResolvedValueOnce(null)
    const response = await archiveKnowledge(
      jsonRequest("http://localhost/api/knowledge/kb-b", { method: "DELETE" }),
      { params: Promise.resolve({ id: "kb-b" }) },
    )
    expect(response.status).toBe(404)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("archives by status instead of hard delete", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "kb-a", userId: "user-a" })
    mocks.update.mockResolvedValueOnce({ id: "kb-a", status: "archived" })
    const response = await archiveKnowledge(
      jsonRequest("http://localhost/api/knowledge/kb-a", { method: "DELETE" }),
      { params: Promise.resolve({ id: "kb-a" }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "kb-a", userId: "user-a" },
      data: { status: "archived" },
    })
  })

  it("cannot bind knowledge to another user's project on create", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce(null)
    const response = await createKnowledge(
      jsonRequest("http://localhost/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "boss_experience",
          title: "经验",
          content: "内容足够长",
          projectId: "project-b",
        }),
      }),
    )
    expect(response.status).toBe(404)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: "project-b", userId: "user-a", status: "active" },
      select: { id: true },
    })
  })

  it("cannot rebind knowledge to another user's project on update", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "kb-a", userId: "user-a", projectId: null })
    mocks.projectFindFirst.mockResolvedValueOnce(null)
    const response = await updateKnowledge(
      jsonRequest("http://localhost/api/knowledge/kb-a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "project-b" }),
      }),
      { params: Promise.resolve({ id: "kb-a" }) },
    )
    expect(response.status).toBe(404)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
