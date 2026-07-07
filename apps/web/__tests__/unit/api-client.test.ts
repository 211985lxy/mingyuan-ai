import { afterEach, describe, expect, it, vi } from "vitest"

import { getApiErrorMessage, listAimHistory, uploadKnowledgeDocument } from "@/lib/api/client"

describe("api client error messages", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps the status code when an error response has no body", () => {
    expect(getApiErrorMessage(null, 404, "Not Found")).toBe("404 Not Found")
  })

  it("hides upstream HTML timeout pages", () => {
    expect(getApiErrorMessage(
      { error: "<html><head><title>504 Gateway Time-out</title></head></html>" },
      504,
      "Gateway Time-out",
    )).toBe("AI 服务响应超时，请稍后重试")
  })

  it("passes the agent filter when listing AIM history", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }))

    await listAimHistory(1, 12, undefined, "content_producer")

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/aim/history?page=1&pageSize=12&agentId=content_producer")
  })

  it("does not throw when document upload succeeds with an empty body", async () => {
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }))

    await expect(
      uploadKnowledgeDocument(new File(["hello"], "hello.txt"), "project_case"),
    ).resolves.toEqual({ created: 0, entries: [] })
  })
})
