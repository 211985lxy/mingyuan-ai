import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildAimChatContent, buildAimChatMessages, runAimChatRequest } from "@/lib/aim/chat-request"
import { chatAim, chatAimStream } from "@/lib/api/client"

vi.mock("@/lib/api/client", () => ({
  chatAim: vi.fn(),
  chatAimStream: vi.fn(),
}))

describe("AIM chat request", () => {
  beforeEach(() => vi.clearAllMocks())

  it("serializes user images without changing assistant text", () => {
    expect(buildAimChatContent("看图", [{ readUrl: "https://example.com/a.jpg" }])).toEqual([
      { type: "text", text: "看图" },
      { type: "image_url", image_url: { url: "https://example.com/a.jpg" } },
    ])
    expect(buildAimChatMessages([
      { role: "user", content: "看图", images: [{ readUrl: "https://example.com/a.jpg" }] },
      { role: "assistant", content: "收到" },
    ])[1].content).toBe("收到")
  })

  it("returns tool content through the same update callback", async () => {
    vi.mocked(chatAim).mockResolvedValue({ content: "同步完成" })
    const onContent = vi.fn()
    const result = await runAimChatRequest({
      messages: [{ role: "user", content: "同步到飞书" }],
      agentId: "content_producer",
      toolAction: "export_lark_generation",
      resultId: "generation-1",
      signal: new AbortController().signal,
      onContent,
    })

    expect(result.hasContent).toBe(true)
    expect(onContent).toHaveBeenCalledWith("同步完成")
    expect(chatAimStream).not.toHaveBeenCalled()
  })

  it("streams incremental content and reports an empty response", async () => {
    vi.mocked(chatAimStream).mockImplementation(async (_messages, options) => {
      options.onDelta("第一段", "第一段")
      return { content: "第一段" }
    })
    const onContent = vi.fn()
    const streamed = await runAimChatRequest({
      messages: [{ role: "user", content: "写一版" }],
      agentId: "content_producer",
      signal: new AbortController().signal,
      onContent,
    })
    expect(streamed.hasContent).toBe(true)
    expect(onContent).toHaveBeenCalledWith("第一段")

    vi.mocked(chatAimStream).mockResolvedValue({ content: "" })
    const empty = await runAimChatRequest({
      messages: [{ role: "user", content: "再写一版" }],
      agentId: "content_producer",
      signal: new AbortController().signal,
      onContent,
    })
    expect(empty.hasContent).toBe(false)
  })

  it("流式请求带上委托引擎", async () => {
    vi.mocked(chatAimStream).mockResolvedValue({ content: "质检结果" })
    await runAimChatRequest({
      messages: [{ role: "user", content: "标题质检" }],
      agentId: "work_editor",
      executionAgentId: "content_review",
      signal: new AbortController().signal,
      onContent: vi.fn(),
    })
    expect(chatAimStream).toHaveBeenCalledWith(
      [{ role: "user", content: "标题质检" }],
      expect.objectContaining({
        agentId: "work_editor",
        executionAgentId: "content_review",
      }),
    )
  })

  it("非流式工具请求带上委托引擎", async () => {
    vi.mocked(chatAim).mockResolvedValue({ content: "同步完成" })
    await runAimChatRequest({
      messages: [{ role: "user", content: "同步到飞书" }],
      agentId: "work_editor",
      executionAgentId: "content_review",
      toolAction: "export_lark_generation",
      resultId: "generation-1",
      signal: new AbortController().signal,
      onContent: vi.fn(),
    })
    expect(chatAim).toHaveBeenCalledWith(
      [{ role: "user", content: "同步到飞书" }],
      expect.objectContaining({
        agentId: "work_editor",
        executionAgentId: "content_review",
        toolAction: "export_lark_generation",
      }),
    )
  })

  it("普通发送不带委托字段，options 与今天一致", async () => {
    vi.mocked(chatAimStream).mockResolvedValue({ content: "好" })
    await runAimChatRequest({
      messages: [{ role: "user", content: "帮我看看" }],
      agentId: "work_editor",
      signal: new AbortController().signal,
      onContent: vi.fn(),
    })
    const options = vi.mocked(chatAimStream).mock.calls[0][1]
    expect(options).not.toHaveProperty("executionAgentId")
    expect(options).toEqual(expect.objectContaining({
      agentId: "work_editor",
    }))
  })
})
