import { describe, expect, it, vi, beforeEach } from "vitest"

const findFirst = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const parseDocument = vi.hoisted(() => vi.fn())
const isSupportedFile = vi.hoisted(() => vi.fn())
const ensureKnowledgeEmbedding = vi.hoisted(() => vi.fn())
const enforceKnowledgeBetaLimit = vi.hoisted(() => vi.fn())
const enforceUploadSizeLimit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/user-auth", () => ({
  withUserAuth:
    (
      handler: (
        request: Request,
        context: { user: { id: string; email: string } }
      ) => Promise<Response>
    ) =>
    (request: Request) =>
      handler(request, {
        user: { id: "user-1", email: "user@example.com" },
      }),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findFirst },
    knowledgeEntry: { create },
  },
}))

vi.mock("@/lib/document-parser", () => ({
  parseDocument,
  isSupportedFile,
}))

vi.mock("@/lib/llm/embeddings", () => ({
  ensureKnowledgeEmbedding,
}))

vi.mock("@/lib/knowledge-tags", () => ({
  buildDefaultKnowledgeTags: () => ["kb_scope:project"],
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceKnowledgeBetaLimit,
  enforceUploadSizeLimit,
}))

import { POST } from "@/app/api/knowledge/upload/route"

function makeRequest(input: {
  file?: File
  projectId?: string
  category?: string
}) {
  const formData = new FormData()
  if (input.file) formData.append("file", input.file)
  if (input.projectId) formData.append("projectId", input.projectId)
  if (input.category) formData.append("category", input.category)
  return new Request("http://localhost/api/knowledge/upload", {
    method: "POST",
    body: formData,
  })
}

describe("POST /api/knowledge/upload", () => {
  beforeEach(() => {
    findFirst.mockReset()
    create.mockReset()
    parseDocument.mockReset()
    isSupportedFile.mockReset()
    ensureKnowledgeEmbedding.mockReset()
    enforceKnowledgeBetaLimit.mockReset()
    enforceUploadSizeLimit.mockReset()
    ensureKnowledgeEmbedding.mockReturnValue(Promise.resolve())
    enforceUploadSizeLimit.mockReturnValue(null)
    enforceKnowledgeBetaLimit.mockResolvedValue(null)
    isSupportedFile.mockReturnValue(true)
  })

  it("rejects upload without project id", async () => {
    const res = await POST(
      makeRequest({
        file: new File(["demo"], "demo.pdf", { type: "application/pdf" }),
      }) as never,
      undefined as never
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: "请选择归属全案",
    })
  })

  it("imports parsed chunks into the selected project", async () => {
    findFirst.mockResolvedValue({ id: "project-1" })
    parseDocument.mockResolvedValue(["第一段", "第二段"])
    create
      .mockResolvedValueOnce({ id: "entry-1" })
      .mockResolvedValueOnce({ id: "entry-2" })

    const res = await POST(
      makeRequest({
        file: new File(["demo"], "company-profile.pdf", {
          type: "application/pdf",
        }),
        projectId: "project-1",
        category: "project_case",
      }) as never,
      undefined as never
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      data: {
        created: 2,
        entries: [{ id: "entry-1" }, { id: "entry-2" }],
      },
    })
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-1",
        userId: "user-1",
        status: "active",
      },
      select: { id: true },
    })
    expect(create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        userId: "user-1",
        projectId: "project-1",
        category: "project_case",
        title: "company-profile (1/2)",
        content: "第一段",
        sourceType: "import",
        tags: ["kb_scope:project"],
        status: "active",
      }),
      select: { id: true },
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        title: "company-profile (2/2)",
        content: "第二段",
      }),
      select: { id: true },
    })
    expect(ensureKnowledgeEmbedding).toHaveBeenCalledTimes(2)
  })
})
