import { beforeEach, describe, expect, it, vi } from "vitest"

const { complete, mockEnv } = vi.hoisted(() => ({
  complete: vi.fn(),
  mockEnv: {
    SCRIPT_GENERATION_MODEL: undefined as string | undefined,
  },
}))

vi.mock("@/env", () => ({ env: mockEnv }))
vi.mock("@/lib/llm", () => ({
  LLMClient: {
    shared: () => ({
      available: true,
      complete,
    }),
  },
}))

import { polishTranscript, splitTranscriptChunks } from "@/lib/transcript-polish"

describe("splitTranscriptChunks", () => {
  it("keeps short text as a single chunk", () => {
    expect(splitTranscriptChunks("你好世界。", 100)).toEqual(["你好世界。"])
  })

  it("splits on sentence boundaries when over limit", () => {
    const text = "第一句。第二句！第三句？第四句；"
    const chunks = splitTranscriptChunks(text, 8)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join("")).toBe(text)
  })
})

describe("polishTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns short text unchanged without calling LLM", async () => {
    await expect(polishTranscript("短")).resolves.toBe("短")
    expect(complete).not.toHaveBeenCalled()
  })

  it("returns polished text from LLM", async () => {
    complete.mockResolvedValueOnce({ content: "今天天气真好，我们一起出去走走。" })

    await expect(
      polishTranscript("今天天气真好我们一起出去走走"),
    ).resolves.toBe("今天天气真好，我们一起出去走走。")

    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0][0].messages[0].role).toBe("system")
    expect(complete.mock.calls[0][0].temperature).toBe(0.1)
  })

  it("falls back to source when polished result is drastically shorter", async () => {
    const source = "这是一段比较长的口播文案内容，用来验证总结回退逻辑是否生效。"
    complete.mockResolvedValueOnce({ content: "摘要" })

    await expect(polishTranscript(source)).resolves.toBe(source)
  })

  it("falls back to source when LLM throws", async () => {
    complete.mockRejectedValueOnce(new Error("boom"))
    const source = "这是一段会出现错误的测试文案。"

    await expect(polishTranscript(source)).resolves.toBe(source)
  })
})
