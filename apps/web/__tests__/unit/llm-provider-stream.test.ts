import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const publish = vi.fn().mockResolvedValue(1)

vi.mock("@/lib/redis", () => ({
  redis: { publish },
}))

const createMockStream = vi.fn()

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMockStream } }
  },
}))

async function collect(stream: AsyncIterable<string>) {
  const chunks: string[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe("OpenAI-compatible provider stream", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    publish.mockClear()
    createMockStream.mockReset()
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "false"
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.AIM_SHOW_LIVE_THINKING_ENABLED
  })

  it("rejects a reasoning-only stream instead of exposing chain of thought", async () => {
    createMockStream.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { reasoning_content: "这是思考过程" } }] }
    })())
    const { OpenAICompatibleProvider } = await import("@/lib/llm/provider")
    const provider = new OpenAICompatibleProvider({
      name: "test",
      apiKey: "test-key",
      baseURL: "https://example.test/v1",
      defaultModel: "test-model",
    })

    await expect(collect(provider.stream({ messages: [{ role: "user", content: "你好" }] })))
      .rejects.toThrow("Empty response from model test-model")
    expect(createMockStream).toHaveBeenCalledOnce()
    expect(publish).not.toHaveBeenCalled()
  })

  it("yields only content when the flag is on, and never mixes reasoning into the text stream", async () => {
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "true"
    createMockStream.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { reasoning_content: "先想一步" } }] }
      yield { choices: [{ delta: { content: "正文A" } }] }
      yield { choices: [{ delta: { content: "正文B" } }] }
    })())
    const { OpenAICompatibleProvider } = await import("@/lib/llm/provider")
    const { runWithActiveAimTrace, resetLiveThinkingForTests } = await import("@/lib/aim/live-thinking")
    resetLiveThinkingForTests()
    const provider = new OpenAICompatibleProvider({
      name: "test",
      apiKey: "test-key",
      baseURL: "https://example.test/v1",
      defaultModel: "test-model",
    })

    const chunks = await runWithActiveAimTrace("trace-live", () =>
      collect(provider.stream({ messages: [{ role: "user", content: "你好" }] })),
    )
    expect(chunks.join("")).toBe("正文A正文B")
    expect(chunks.join("")).not.toContain("先想一步")
    vi.advanceTimersByTime(200)
    expect(publish).toHaveBeenCalled()
    const payloads = publish.mock.calls.map((call) => JSON.parse(call[1] as string))
    expect(payloads.some((item) => item.text?.includes("先想一步"))).toBe(true)
    expect(payloads.every((item) => item.type === "reasoning")).toBe(true)
    resetLiveThinkingForTests()
  })

  it("does not publish thinking without an active trace even if the flag is on", async () => {
    process.env.AIM_SHOW_LIVE_THINKING_ENABLED = "true"
    createMockStream.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { reasoning_content: "后台任务思考" } }] }
      yield { choices: [{ delta: { content: "答案" } }] }
    })())
    const { OpenAICompatibleProvider } = await import("@/lib/llm/provider")
    const provider = new OpenAICompatibleProvider({
      name: "test",
      apiKey: "test-key",
      baseURL: "https://example.test/v1",
      defaultModel: "test-model",
    })
    expect(await collect(provider.stream({ messages: [{ role: "user", content: "你好" }] }))).toEqual(["答案"])
    vi.advanceTimersByTime(200)
    expect(publish).not.toHaveBeenCalled()
  })
})
