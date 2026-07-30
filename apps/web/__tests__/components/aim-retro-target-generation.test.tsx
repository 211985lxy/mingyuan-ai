/**
 * 复盘目标内容透传：只有本轮引擎是数据复盘时才带 resultId，
 * 且只取当前会话里的交付物，会话里没有就留空（服务端走「未登记」，不猜内容）。
 */
import { renderHook, act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAimChatActions } from "@/hooks/use-aim-chat-actions"

const runAimChatRequest = vi.fn().mockResolvedValue({ hasContent: true })

vi.mock("@/lib/aim/chat-request", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim/chat-request")>("@/lib/aim/chat-request")
  return { ...actual, runAimChatRequest: (...args: unknown[]) => runAimChatRequest(...args) }
})

const DELIVERABLE_MESSAGE = {
  id: "m1",
  role: "assistant" as const,
  content: "交付物已生成",
  deliverables: {
    id: "gen_abc123",
    results: [{ format: "raw_copy" as const, content: "这是一条口播稿", wordCount: 7 }],
  },
}

function setup(overrides: { selectedAgentId?: string; messages?: unknown[] } = {}) {
  return renderHook(() => useAimChatActions({
    messages: (overrides.messages ?? [DELIVERABLE_MESSAGE]) as never,
    setMessages: vi.fn(),
    setInput: vi.fn(),
    setIsThinking: vi.fn(),
    selectedAgentId: (overrides.selectedAgentId ?? "content_retro") as never,
    selectedProjectId: "",
    projectEnabled: false,
    requestAbortRef: { current: null },
    clearCurrentTaskContext: vi.fn(),
    clearImages: vi.fn(),
    runWorkbenchCommand: vi.fn().mockReturnValue(false),
  }))
}

function lastRequest() {
  return runAimChatRequest.mock.calls.at(-1)?.[0] as { resultId?: string }
}

describe("数据复盘：目标内容 id 透传", () => {
  beforeEach(() => {
    runAimChatRequest.mockClear()
  })

  it("复盘会话带上当前会话交付物的生成 id", async () => {
    const hook = setup({ selectedAgentId: "content_retro" })

    await act(async () => {
      await hook.result.current.sendText("复盘这条内容的数据表现")
    })

    expect(lastRequest().resultId).toBe("gen_abc123")
  })

  it("委托到复盘引擎时同样带上目标内容", async () => {
    const hook = setup({ selectedAgentId: "work_editor" })

    await act(async () => {
      await hook.result.current.sendText("复盘这条内容", { executionAgentId: "content_retro" })
    })

    expect(lastRequest().resultId).toBe("gen_abc123")
  })

  it("会话里没有交付物时留空，不猜一条内容", async () => {
    const hook = setup({ selectedAgentId: "content_retro", messages: [] })

    await act(async () => {
      await hook.result.current.sendText("帮我复盘上周那条")
    })

    expect(lastRequest().resultId).toBeUndefined()
  })

  it("非复盘会话不带目标内容", async () => {
    const hook = setup({ selectedAgentId: "work_editor" })

    await act(async () => {
      await hook.result.current.sendText("帮我润色这段")
    })

    expect(lastRequest().resultId).toBeUndefined()
  })
})
