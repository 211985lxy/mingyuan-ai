/**
 * 技能按钮 → 发送链路的委托透传。
 *
 * 技能按钮只把提示词填进输入框，真正发送发生在下一次点击；
 * 这里钉死"委托意图能活到那一次发送"，以及"用户改写掉提示词后自动失效"。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useAimSendActions } from "@/features/aim/hooks/use-aim-send-actions"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

const TITLE_REVIEW_SKILL: AimWorkbenchSkill = {
  id: "title_review",
  label: "标题质检",
  description: "检查标题吸引力、准确性和风险表达。",
  prompt: "请基于当前文案做标题质检：指出标题是否准确、有钩子、是否夸大或违规，并给最小修改建议。",
  agentId: "content_review",
}

const POLISH_SKILL: AimWorkbenchSkill = {
  id: "text_polish",
  label: "文字二改/润色",
  description: "对现有成稿去 AI 味。",
  prompt: "请对当前文案做文字二改/润色：保留核心意思和事实，明显去 AI 味。",
  agentId: "work_editor",
}

function setup(overrides: Record<string, unknown> = {}) {
  const sendText = vi.fn(async () => undefined)
  const generateWithInput = vi.fn(async () => undefined)
  let input = ""

  const hook = renderHook((props: { input: string }) => useAimSendActions({
    messages: [],
    input: props.input,
    selectedAgentId: "work_editor",
    hasEditorSelection: false,
    referenceSelection: { text: "", range: undefined },
    draftSelection: { text: "", range: undefined },
    editorText: "",
    sourceOriginalText: "",
    sourceAnalysisText: "",
    sourceTopicTitle: "",
    editorPanelLabels: {
      documentType: "文案",
      referenceTitle: "参考",
      draftTitle: "草稿",
    },
    imageAttachments: [],
    setInput: (value: string | ((prev: string) => string)) => {
      input = typeof value === "function" ? value(input) : value
    },
    sendText,
    generateWithInput,
    runWorkbenchCommand: () => false,
    ...overrides,
  } as never), { initialProps: { input: "" } })

  return { hook, sendText, generateWithInput, getInput: () => input }
}

describe("技能跨引擎委托：技能按钮 → 发送", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("质检技能填入后发送，请求带上质检引擎", async () => {
    const { hook, sendText, getInput } = setup()

    act(() => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    hook.rerender({ input: getInput() })
    await act(async () => {
      await hook.result.current.handleSend()
    })

    expect(sendText).toHaveBeenCalledWith(
      TITLE_REVIEW_SKILL.prompt,
      expect.objectContaining({ executionAgentId: "content_review" }),
    )
  })

  it("技能属于当前智能体时不带引擎字段，行为不变", async () => {
    const { hook, sendText, getInput } = setup()

    act(() => {
      hook.result.current.handleUseSkill(POLISH_SKILL)
    })
    hook.rerender({ input: getInput() })
    await act(async () => {
      await hook.result.current.handleSend()
    })

    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("没点技能直接发送时不带引擎字段", async () => {
    const { hook, sendText } = setup()

    hook.rerender({ input: "帮我看看这段" })
    await act(async () => {
      await hook.result.current.handleSend()
    })

    expect(sendText.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("用户把技能提示词改掉后委托自动失效", async () => {
    const { hook, sendText } = setup()

    act(() => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    // 用户清空重写，输入框里已经没有技能提示词
    hook.rerender({ input: "算了，直接帮我改一版" })
    await act(async () => {
      await hook.result.current.handleSend()
    })

    expect(sendText.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("委托只用一次，第二次发送不再复用", async () => {
    const { hook, sendText, getInput } = setup()

    act(() => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    hook.rerender({ input: getInput() })
    await act(async () => {
      await hook.result.current.handleSend()
    })
    await act(async () => {
      await hook.result.current.handleSend()
    })

    expect(sendText.mock.calls[0][1]).toMatchObject({ executionAgentId: "content_review" })
    expect(sendText.mock.calls[1][1]).not.toHaveProperty("executionAgentId")
  })

  // generate 不支持 executionAgentId，落到那条路等于静默换回当前会话的引擎
  it("有委托时生成入口改走 chat，不把委托丢给 generate", async () => {
    const { hook, generateWithInput, sendText, getInput } = setup()

    act(() => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    hook.rerender({ input: getInput() })
    await act(async () => {
      await hook.result.current.handleGenerate()
    })

    expect(generateWithInput).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(
      TITLE_REVIEW_SKILL.prompt,
      expect.objectContaining({ executionAgentId: "content_review" }),
    )
  })

  it("没有委托时生成入口照常走 generate，且不带引擎字段", async () => {
    const { hook, generateWithInput, sendText } = setup()

    hook.rerender({ input: "帮我写一版新的口播" })
    await act(async () => {
      await hook.result.current.handleGenerate()
    })

    expect(sendText).not.toHaveBeenCalled()
    expect(generateWithInput).toHaveBeenCalledTimes(1)
    expect(generateWithInput.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })
})
