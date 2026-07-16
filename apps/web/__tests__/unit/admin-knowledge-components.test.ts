import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { InternalModelTestPanel } from "@/components/admin/internal-model-test-panel"
import { analyzeSmartImport, confirmSmartImport } from "@/components/admin/knowledge/smart-import-service"

describe("admin knowledge components", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders the internal model test panel collapsed without reading auth", () => {
    const getToken = vi.fn(() => "admin-token")
    const html = renderToStaticMarkup(createElement(InternalModelTestPanel, { getToken }))

    expect(html).toContain("中转站测试（内部）")
    expect(html).toContain("展开")
    expect(getToken).not.toHaveBeenCalled()
  })

  it("sends selected files and project to smart import analysis", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { userId: "user-1", projectId: "project-1", processed: [], fileNames: ["notes.txt"] },
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const file = new File(["meeting notes"], "notes.txt", { type: "text/plain" })

    const result = await analyzeSmartImport({ files: [file], projectId: "project-1", token: "admin-token" })

    expect(result.fileNames).toEqual(["notes.txt"])
    const [, request] = fetchMock.mock.calls[0]
    expect(request.headers.Authorization).toBe("Bearer admin-token")
    expect(request.body.get("projectId")).toBe("project-1")
    expect(request.body.getAll("files")).toHaveLength(1)
  })

  it("confirms only entries that were not skipped", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const count = await confirmSmartImport({
      token: "admin-token",
      preview: {
        userId: "user-1",
        projectId: null,
        fileNames: ["notes.txt"],
        processed: [
          { index: 0, originalText: "A", detectedSource: "file", suggestedTitle: "A", suggestedKeyPoints: "A", suggestedCategory: "project_case", suggestedTags: [], suggestedValueGrade: "A", confidence: "high" },
          { index: 1, originalText: "B", detectedSource: "file", suggestedTitle: "B", suggestedKeyPoints: "B", suggestedCategory: "customer_qa", suggestedTags: [], suggestedValueGrade: "B", confidence: "high" },
        ],
      },
      edits: { 0: { title: "edited A" }, 1: { skip: true } },
    })

    expect(count).toBe(1)
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.entries).toEqual([expect.objectContaining({ title: "edited A", content: "A" })])
  })

})
