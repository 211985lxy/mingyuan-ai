import { execFile } from "node:child_process"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
  execFile: vi.fn((command, args, options, callback) => {
    callback(null, { stdout: "# 转换结果\n\nPPT 内容", stderr: "" })
  }),
}))

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: "mammoth 回退正文" })),
  },
}))

describe("document parser", () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset()
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback
      cb?.(null, { stdout: "# 转换结果\n\nPPT 内容", stderr: "" })
    })
  })

  it("uses MarkItDown for pptx when OfficeCLI is unavailable", async () => {
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback
      if (command === "officecli") {
        cb?.(new Error("not found"), { stdout: "", stderr: "" })
        return
      }
      cb?.(null, { stdout: "# 转换结果\n\nPPT 内容", stderr: "" })
    })

    const { isSupportedFile, parseDocument } = await import("@/lib/document-parser")

    await expect(parseDocument(Buffer.from("pptx"), "demo.pptx")).resolves.toEqual(["# 转换结果\n\nPPT 内容"])
    expect(isSupportedFile("demo.pptx")).toBe(true)
    expect(execFile).toHaveBeenCalledWith(
      "officecli",
      ["view", expect.stringMatching(/input\.pptx$/), "text"],
      expect.any(Object),
      expect.any(Function),
    )
    expect(execFile).toHaveBeenCalledWith(
      "markitdown",
      [expect.stringMatching(/input\.pptx$/)],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it("prefers OfficeCLI text view for docx when available", async () => {
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback
      if (command === "officecli") {
        cb?.(null, { stdout: "【标题】\n客户痛点：决策慢", stderr: "" })
        return
      }
      cb?.(null, { stdout: "should-not-use-markitdown", stderr: "" })
    })

    vi.resetModules()
    const { parseDocument } = await import("@/lib/document-parser")
    await expect(parseDocument(Buffer.from("docx-bytes"), "brief.docx")).resolves.toEqual([
      "【标题】\n客户痛点：决策慢",
    ])
    expect(execFile).toHaveBeenCalledWith(
      "officecli",
      ["view", expect.stringMatching(/input\.docx$/), "text"],
      expect.any(Object),
      expect.any(Function),
    )
    expect(execFile).not.toHaveBeenCalledWith(
      "markitdown",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
  })
})
