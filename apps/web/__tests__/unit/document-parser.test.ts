import { execFile } from "node:child_process"
import { describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
  execFile: vi.fn((command, args, options, callback) => {
    callback(null, { stdout: "# 转换结果\n\nPPT 内容", stderr: "" })
  }),
}))

describe("document parser", () => {
  it("uses MarkItDown for pptx uploads", async () => {
    const { isSupportedFile, parseDocument } = await import("@/lib/document-parser")

    await expect(parseDocument(Buffer.from("pptx"), "demo.pptx")).resolves.toEqual(["# 转换结果\n\nPPT 内容"])
    expect(isSupportedFile("demo.pptx")).toBe(true)
    expect(execFile).toHaveBeenCalledWith("markitdown", [expect.stringMatching(/input\.pptx$/)], expect.any(Object), expect.any(Function))
  })
})
