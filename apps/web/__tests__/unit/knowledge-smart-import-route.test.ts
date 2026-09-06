import { beforeEach, describe, expect, it, vi } from "vitest"

const findFirst = vi.hoisted(() => vi.fn())
const parseDocument = vi.hoisted(() => vi.fn())
const isSupportedFile = vi.hoisted(() => vi.fn())
const processChunksForSmartImport = vi.hoisted(() => vi.fn())
const enforceUploadSizeLimit = vi.hoisted(() => vi.fn())
const resolveBoundProject = vi.hoisted(() => vi.fn())

vi.mock("@/lib/user-auth", () => ({
  withUserAuth:
    (
      handler: (
        request: Request,
        context: { user: { id: string; email: string } },
      ) => Promise<Response>,
    ) =>
    (request: Request) =>
      handler(request, {
        user: { id: "user-1", email: "user@example.com" },
      }),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findFirst },
  },
}))

vi.mock("@/lib/document-parser", () => ({
  parseDocument,
  isSupportedFile,
}))

vi.mock("@/lib/knowledge-auto-processor", () => ({
  processChunksForSmartImport,
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceUploadSizeLimit,
}))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))

import { POST } from "@/app/api/knowledge/smart-import/route"

function makeRequest(input: { files?: File[]; projectId?: string }) {
  const formData = new FormData()
  for (const file of input.files ?? []) formData.append("files", file)
  if (input.projectId) formData.append("projectId", input.projectId)
  return new Request("http://localhost/api/knowledge/smart-import", {
    method: "POST",
    body: formData,
  })
}

describe("POST /api/knowledge/smart-import", () => {
  beforeEach(() => {
    findFirst.mockReset()
    resolveBoundProject.mockReset()
    resolveBoundProject.mockResolvedValue({ id: "project-1", name: "项目一", status: "active" })
    parseDocument.mockReset()
    isSupportedFile.mockReset()
    processChunksForSmartImport.mockReset()
    enforceUploadSizeLimit.mockReset()
    enforceUploadSizeLimit.mockReturnValue(null)
    isSupportedFile.mockReturnValue(true)
  })

  it("uses the account-bound project when project id is missing", async () => {
    parseDocument.mockResolvedValue(["hello"])
    processChunksForSmartImport.mockResolvedValue([])
    const res = await POST(
      makeRequest({
        files: [new File(["hello"], "note.md", { type: "text/markdown" })],
      }) as never,
      undefined as never,
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: { projectId: "project-1" } })
  })

  it("rejects when no files uploaded", async () => {
    const res = await POST(
      makeRequest({ projectId: "project-1" }) as never,
      undefined as never,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "请上传至少一个文件" })
  })

  it("returns 404 when project is not owned by user", async () => {
    resolveBoundProject.mockRejectedValue(Object.assign(new Error("当前账号只能使用已绑定的项目"), {
      code: "PROJECT_CONTEXT_MISMATCH",
      status: 409,
    }))
    const res = await POST(
      makeRequest({
        projectId: "project-x",
        files: [new File(["hello"], "note.md", { type: "text/markdown" })],
      }) as never,
      undefined as never,
    )
    expect(res.status).toBe(409)
    expect(processChunksForSmartImport).not.toHaveBeenCalled()
  })

  it("rejects unsupported file names", async () => {
    isSupportedFile.mockReturnValue(false)
    resolveBoundProject.mockResolvedValue({ id: "project-1", name: "项目一", status: "active" })
    const res = await POST(
      makeRequest({
        projectId: "project-1",
        files: [new File(["x"], "clip.mp4", { type: "video/mp4" })],
      }) as never,
      undefined as never,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: "暂不支持：clip.mp4",
    })
  })

  it("parses files and returns cleaned preview without writing", async () => {
    resolveBoundProject.mockResolvedValue({ id: "project-1", name: "项目一", status: "active" })
    parseDocument.mockResolvedValue(["老板卖点一段"])
    processChunksForSmartImport.mockResolvedValue([
      {
        index: 0,
        originalText: "老板卖点一段",
        detectedSource: "general",
        suggestedTitle: "卖点",
        suggestedKeyPoints: "卖点摘要",
        suggestedCategory: "product_usp",
        suggestedTags: ["kb_scope:project"],
        suggestedValueGrade: "A",
        confidence: "high",
      },
    ])

    const res = await POST(
      makeRequest({
        projectId: "project-1",
        files: [new File(["老板卖点一段"], "usp.md", { type: "text/markdown" })],
      }) as never,
      undefined as never,
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: {
        userId: "user-1",
        projectId: "project-1",
        fileNames: ["usp.md"],
        processed: [{ suggestedTitle: "卖点", suggestedCategory: "product_usp" }],
      },
    })
    expect(processChunksForSmartImport).toHaveBeenCalledWith({
      chunks: ["老板卖点一段"],
      fileName: "usp.md",
      userId: "user-1",
      projectId: "project-1",
    })
  })
})
