import { beforeEach, describe, expect, it, vi } from "vitest"

const execFileMock = vi.hoisted(() => vi.fn())
const forkMock = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    execFile: execFileMock,
    fork: forkMock,
  }
})

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: "SHOULD_NOT_USE_UNBOUNDED_FALLBACK" })),
  },
}))

vi.mock("pdf-parse", () => ({
  default: vi.fn(async () => ({ text: "SHOULD_NOT_USE_UNBOUNDED_FALLBACK", numpages: 1 })),
}))

vi.mock("xlsx", () => ({
  read: vi.fn(() => ({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } })),
  utils: { sheet_to_csv: vi.fn(() => "a,b\n1,2") },
}))

describe("document parser security", () => {
  beforeEach(() => {
    vi.resetModules()
    execFileMock.mockReset()
    forkMock.mockReset()
    execFileMock.mockImplementation((command, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback
      cb?.(new Error("converter unavailable"), { stdout: "", stderr: "" })
    })
  })

  it("does not fall back to unbounded in-process parse when child fails", async () => {
    forkMock.mockImplementation(() => {
      const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
      const child = {
        send: vi.fn(),
        on: (event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = handlers[event] || []
          handlers[event].push(cb)
          return child
        },
        kill: vi.fn(),
        connected: true,
      }
      queueMicrotask(() => {
        for (const cb of handlers["message"] || []) {
          cb({ ok: false, error: "child boom", code: "PARSE_CHILD_FAILED" })
        }
      })
      return child
    })

    const { parseDocument } = await import("@/lib/document-parser")
    await expect(parseDocument(Buffer.from("%PDF-1.4"), "x.pdf")).rejects.toThrow(
      /child|超时|失败|PARSE_/i,
    )
    const mammoth = await import("mammoth")
    const pdfParse = await import("pdf-parse")
    expect(mammoth.default.extractRawText).not.toHaveBeenCalled()
    expect(pdfParse.default).not.toHaveBeenCalled()
  })

  it("rejects extracted text over 1MiB with clear 422-style error", async () => {
    const huge = "x".repeat(1024 * 1024 + 10)
    forkMock.mockImplementation(() => {
      const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
      const child = {
        send: vi.fn(),
        on: (event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = handlers[event] || []
          handlers[event].push(cb)
          return child
        },
        kill: vi.fn(),
        connected: true,
      }
      queueMicrotask(() => {
        for (const cb of handlers["message"] || []) {
          cb({ ok: false, error: "提取文本超过 1MiB 上限", code: "PARSE_TEXT_TOO_LARGE" })
        }
      })
      return child
    })

    const { parseDocument, DocumentParseError } = await import("@/lib/document-parser")
    await expect(parseDocument(Buffer.from("docx"), "a.docx")).rejects.toMatchObject({
      code: "PARSE_TEXT_TOO_LARGE",
      status: 422,
    })
    expect(DocumentParseError).toBeTruthy()
    expect(huge.length).toBeGreaterThan(1024 * 1024)
  })

  it("surfaces timeout without in-process fallback", async () => {
    process.env.DOCUMENT_PARSE_TIMEOUT_MS = "40"
    forkMock.mockImplementation(() => {
      const child = {
        send: vi.fn(),
        on: vi.fn().mockReturnThis(),
        kill: vi.fn(),
        connected: true,
      }
      return child
    })

    vi.resetModules()
    const { parseDocument } = await import("@/lib/document-parser")
    await expect(parseDocument(Buffer.from("%PDF-1.4"), "doc.pdf")).rejects.toThrow(
      /超时|timeout|PARSE_TIMEOUT/i,
    )
    delete process.env.DOCUMENT_PARSE_TIMEOUT_MS
  }, 10_000)
})
