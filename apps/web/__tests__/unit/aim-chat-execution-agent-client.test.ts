/**
 * chatAim / chatAimStream 请求体：委托字段透传，普通发送零变化。
 *
 * 用整个 body 对象相等断言，多出任何键都会被发现。
 */
import { afterEach, describe, expect, it, vi } from "vitest"

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

describe("AIM chat client：executionAgentId 透传", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("流式请求体带上质检引擎，且其余字段与今天一致", async () => {
    const storage = createMemoryStorage()
    vi.stubGlobal("localStorage", storage)
    vi.stubGlobal("window", { localStorage: storage })

    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("质检完成"))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { chatAimStream } = await import("@/lib/api/client")
    await chatAimStream(
      [{ role: "user", content: "标题质检" }],
      {
        agentId: "work_editor",
        executionAgentId: "content_review",
        onDelta: vi.fn(),
      },
    )

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messages: [{ role: "user", content: "标题质检" }],
      agentId: "work_editor",
      executionAgentId: "content_review",
      stream: true,
    })
  })

  it("普通流式发送请求体零变化（不出现 executionAgentId 键）", async () => {
    const storage = createMemoryStorage()
    vi.stubGlobal("localStorage", storage)
    vi.stubGlobal("window", { localStorage: storage })

    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("好"))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { chatAimStream } = await import("@/lib/api/client")
    await chatAimStream(
      [{ role: "user", content: "帮我看看这段" }],
      { agentId: "work_editor", onDelta: vi.fn() },
    )

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messages: [{ role: "user", content: "帮我看看这段" }],
      agentId: "work_editor",
      stream: true,
    })
  })

  it("非流式请求体带上质检引擎", async () => {
    vi.resetModules()
    const requestMock = vi.fn().mockResolvedValue({ content: "ok" })
    vi.doMock("@/lib/api/core", async () => {
      const actual = await vi.importActual<typeof import("@/lib/api/core")>("@/lib/api/core")
      return { ...actual, request: requestMock }
    })

    const { chatAim } = await import("@/lib/api/aim-chat")
    await chatAim(
      [{ role: "user", content: "标题质检" }],
      { agentId: "work_editor", executionAgentId: "content_review" },
    )

    const body = JSON.parse(requestMock.mock.calls[0][1].body as string)
    expect(body).toEqual({
      messages: [{ role: "user", content: "标题质检" }],
      agentId: "work_editor",
      executionAgentId: "content_review",
    })
  })

  it("普通非流式发送请求体零变化", async () => {
    vi.resetModules()
    const requestMock = vi.fn().mockResolvedValue({ content: "ok" })
    vi.doMock("@/lib/api/core", async () => {
      const actual = await vi.importActual<typeof import("@/lib/api/core")>("@/lib/api/core")
      return { ...actual, request: requestMock }
    })

    const { chatAim } = await import("@/lib/api/aim-chat")
    await chatAim(
      [{ role: "user", content: "帮我看看这段" }],
      { agentId: "work_editor" },
    )

    expect(JSON.parse(requestMock.mock.calls[0][1].body as string)).toEqual({
      messages: [{ role: "user", content: "帮我看看这段" }],
      agentId: "work_editor",
    })
  })
})
