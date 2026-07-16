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

describe("AIM chat stream client", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("accumulates streamed chunks and reports each delta", async () => {
    const storage = createMemoryStorage()
    vi.stubGlobal("localStorage", storage)
    vi.stubGlobal("window", { localStorage: storage })

    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("你"))
        controller.enqueue(encoder.encode("好"))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { chatAimStream } = await import("@/lib/api/client")
    const onDelta = vi.fn()
    const result = await chatAimStream(
      [{ role: "user", content: "开始" }],
      { agentId: "content_producer", onDelta },
    )

    expect(result).toEqual({ content: "你好" })
    expect(onDelta).toHaveBeenNthCalledWith(1, "你", "你")
    expect(onDelta).toHaveBeenNthCalledWith(2, "好", "你好")
    expect(fetchMock).toHaveBeenCalledWith("/api/aim/chat", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "开始" }],
        agentId: "content_producer",
        stream: true,
      }),
    }))
  })
})
