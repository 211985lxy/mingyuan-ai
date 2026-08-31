import { describe, expect, it, vi } from "vitest"

const createMockStream = vi.fn(async () => (async function* () {
  yield { choices: [{ delta: { reasoning_content: "这是思考过程" } }] }
})())

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMockStream } }
  },
}))

describe("OpenAI-compatible provider stream", () => {
  it("rejects a reasoning-only stream instead of exposing chain of thought", async () => {
    const { OpenAICompatibleProvider } = await import("@/lib/llm/provider")
    const provider = new OpenAICompatibleProvider({
      name: "test",
      apiKey: "test-key",
      baseURL: "https://example.test/v1",
      defaultModel: "test-model",
    })

    const read = async () => {
      const chunks: string[] = []
      for await (const chunk of provider.stream({ messages: [{ role: "user", content: "你好" }] })) {
        chunks.push(chunk)
      }
      return chunks
    }

    await expect(read()).rejects.toThrow("Empty response from model test-model")
    expect(createMockStream).toHaveBeenCalledOnce()
  })
})
