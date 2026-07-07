import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  parseDocument: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: (request: Request) => Promise<Response>) => handler,
}))

vi.mock("@/lib/document-parser", () => ({
  parseDocument: (...args: unknown[]) => mocks.parseDocument(...args),
}))

async function postFiles(files: File[]) {
  const formData = new FormData()
  for (const file of files) formData.append("files", file)

  const { POST } = await import("@/app/api/admin/benchmark-profiles/import-text/route")
  return POST(new Request("http://localhost/api/admin/benchmark-profiles/import-text", {
    method: "POST",
    body: formData,
  }))
}

describe("benchmark profile text import", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.parseDocument.mockReset()
  })

  it("returns parsed files and combined text", async () => {
    mocks.parseDocument
      .mockResolvedValueOnce(["聊天记录"])
      .mockResolvedValueOnce(["Markdown 内容"])

    const res = await postFiles([
      new File(["a"], "chat.txt", { type: "text/plain" }),
      new File(["b"], "doc.md", { type: "text/markdown" }),
    ])
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.files).toEqual([
      { name: "chat.txt", text: "聊天记录" },
      { name: "doc.md", text: "Markdown 内容" },
    ])
    expect(json.data.combinedText).toBe("【文件：chat.txt】\n聊天记录\n\n【文件：doc.md】\nMarkdown 内容")
  })

  it("rejects empty uploads", async () => {
    const res = await postFiles([])

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "请上传至少一个文件" })
  })

  it("returns parser errors", async () => {
    mocks.parseDocument.mockRejectedValueOnce(new Error("不支持的文件格式: .exe"))

    const res = await postFiles([
      new File(["x"], "bad.exe"),
    ])

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "不支持的文件格式: .exe" })
  })
})
