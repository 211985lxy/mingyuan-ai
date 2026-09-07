/**
 * 技能按钮 → 一键出稿链路的委托透传。
 *
 * 点技能直接把指令填进输入框并立即生成/发送；这里钉死：
 *   1. 委托意图能在同一次点击里透传到生成/发送请求；
 *   2. 技能属于当前智能体时不带引擎字段；
 *   3. 有编辑器选区时走发送（带编辑器上下文）；
 *   4. 委托只生效一次，之后的手动发送不再复用引擎。
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
    editorText: "当前素材",
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

describe("技能一键出稿：点技能 → 立即生成/发送", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("点质检技能立即生成，请求带上质检引擎", async () => {
    const { hook, generateWithInput, sendText } = setup()

    await act(async () => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })

    expect(sendText).not.toHaveBeenCalled()
    expect(generateWithInput).toHaveBeenCalledWith(
      TITLE_REVIEW_SKILL.prompt,
      expect.objectContaining({ executionAgentId: "content_review" }),
    )
  })

  it("点当前智能体自己的技能时不带引擎字段", async () => {
    const { hook, generateWithInput } = setup()

    await act(async () => {
      hook.result.current.handleUseSkill(POLISH_SKILL)
    })

    expect(generateWithInput).toHaveBeenCalledTimes(1)
    expect(generateWithInput.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("有编辑器选区时点技能走发送，带质检引擎和编辑器上下文", async () => {
    const { hook, sendText, generateWithInput } = setup({
      hasEditorSelection: true,
      editorText: "待质检的草稿",
      draftSelection: { text: "待质检的草稿", range: { start: 0, end: 0 } },
    })

    await act(async () => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })

    expect(generateWithInput).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(
      TITLE_REVIEW_SKILL.prompt,
      expect.objectContaining({ executionAgentId: "content_review" }),
    )
  })

  it("没点技能直接发送时不带引擎字段", async () => {
    const { hook, sendText } = setup()

    hook.rerender({ input: "帮我看看这段" })
    await act(async () => {
      await hook.result.current.handleSend()
    })

    expect(sendText.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("没点技能直接生成时不带引擎字段", async () => {
    const { hook, generateWithInput, sendText } = setup()

    hook.rerender({ input: "帮我写一版新的口播" })
    await act(async () => {
      await hook.result.current.handleGenerate()
    })

    expect(sendText).not.toHaveBeenCalled()
    expect(generateWithInput).toHaveBeenCalledTimes(1)
    expect(generateWithInput.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("技能委托只生效一次，之后的手动发送不再复用引擎", async () => {
    const { hook, generateWithInput, sendText } = setup()

    await act(async () => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    expect(generateWithInput.mock.calls[0][1]).toMatchObject({ executionAgentId: "content_review" })

    // 输入框残留技能 prompt，但委托已在点击时消费；手动再发送不应再带引擎
    hook.rerender({ input: TITLE_REVIEW_SKILL.prompt })
    await act(async () => {
      await hook.result.current.handleSend()
    })
    expect(sendText.mock.calls[0][1]).not.toHaveProperty("executionAgentId")
  })

  it("无素材时点技能只填指令，不触发生成", async () => {
    const { hook, generateWithInput, sendText, getInput } = setup({ editorText: "" })

    await act(async () => {
      hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })

    expect(generateWithInput).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
    // 指令已填入输入框，等待用户补充素材后手动发送
    expect(getInput()).toBe(TITLE_REVIEW_SKILL.prompt)
  })
})
