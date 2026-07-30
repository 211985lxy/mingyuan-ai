/**
 * 意图门闩路径：主发送按钮绕开 handleSend，必须自己取走技能委托。
 *
 * 钉死：
 *   1. 质检技能 → 主发送 → sendText 带 executionAgentId
 *   2. 普通发送 → sendText 不带该字段
 *   3. 用户改写提示词后委托失效
 *   4. 委托只用一次
 *   5. 质检提示词即便被规则判成 local_edit，有委托时仍强制走 chat
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useAimSendActions } from "@/features/aim/hooks/use-aim-send-actions"
import { useAimTurnIntentGate } from "@/features/aim/hooks/use-aim-turn-intent-gate"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

vi.mock("@/lib/api/aim", () => ({
  resolveAimTurnIntentRemote: vi.fn(async () => {
    throw new Error("offline")
  }),
}))

const TITLE_REVIEW_SKILL: AimWorkbenchSkill = {
  id: "title_review",
  label: "标题质检",
  description: "检查标题吸引力、准确性和风险表达。",
  prompt: "请基于当前文案做标题质检：指出标题是否准确、有钩子、是否夸大或违规，并给最小修改建议。",
  agentId: "content_review",
}

const editorLabels = {
  documentType: "文案",
  referenceTitle: "参考",
  draftTitle: "草稿",
}

function setupGate(inputText: string, sendActions: {
  takeSkillDelegation: (text: string) => { executionAgentId?: string }
  peekSkillDelegation: (text: string) => { executionAgentId?: string }
}) {
  const sendText = vi.fn(async () => undefined)
  const generateWithInput = vi.fn(async () => undefined)

  const gate = renderHook((props: { text: string }) => useAimTurnIntentGate({
    hasEditorSelection: false,
    imageCount: 0,
    handleGenerate: vi.fn(),
    text: props.text,
    messageCount: 0,
    messages: [],
    editorText: "",
    editorLabels,
    runWorkbenchCommand: () => false,
    defaultFormats: ["video_script"],
    projectEnabled: false,
    selectedProjectId: "",
    sendText,
    generateWithInput,
    consumeSkillDelegation: sendActions.takeSkillDelegation,
    peekSkillDelegation: sendActions.peekSkillDelegation,
  }), { initialProps: { text: inputText } })

  return { gate, sendText, generateWithInput }
}

function setupSkillActions() {
  let input = ""
  const sendText = vi.fn(async () => undefined)
  const generateWithInput = vi.fn(async () => undefined)

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
    editorPanelLabels: editorLabels,
    imageAttachments: [],
    setInput: (value: string | ((prev: string) => string)) => {
      input = typeof value === "function" ? value(input) : value
    },
    sendText,
    generateWithInput,
    runWorkbenchCommand: () => false,
  } as never), { initialProps: { input: "" } })

  return {
    hook,
    getInput: () => input,
    takeSkillDelegation: (text: string) => hook.result.current.takeSkillDelegation(text),
    peekSkillDelegation: (text: string) => hook.result.current.peekSkillDelegation(text),
  }
}

describe("意图门闩：技能跨引擎委托", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("质检技能填入后走主发送，sendText 带上质检引擎", async () => {
    const skill = setupSkillActions()
    act(() => {
      skill.hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    const text = skill.getInput()
    skill.hook.rerender({ input: text })

    const { gate, sendText, generateWithInput } = setupGate(text, {
      takeSkillDelegation: skill.takeSkillDelegation,
      peekSkillDelegation: skill.peekSkillDelegation,
    })

    await act(async () => {
      gate.result.current.handleGenerateOrPlan()
      await vi.waitFor(() => expect(sendText).toHaveBeenCalled())
    })

    expect(generateWithInput).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(
      text,
      expect.objectContaining({ executionAgentId: "content_review" }),
    )
  })

  it("没点技能的普通发送不带引擎字段", async () => {
    const skill = setupSkillActions()
    const text = "这篇有什么问题"
    const { gate, sendText } = setupGate(text, {
      takeSkillDelegation: skill.takeSkillDelegation,
      peekSkillDelegation: skill.peekSkillDelegation,
    })

    await act(async () => {
      gate.result.current.handleGenerateOrPlan()
      await vi.waitFor(() => expect(sendText).toHaveBeenCalled())
    })

    const options = sendText.mock.calls[0][1]
    if (options) {
      expect(options).not.toHaveProperty("executionAgentId")
    }
  })

  it("用户改写技能提示词后委托失效，且可走生成确认", async () => {
    const skill = setupSkillActions()
    act(() => {
      skill.hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    // 输入框已无技能提示词
    const rewritten = "算了，直接帮我改一版开头"
    skill.hook.rerender({ input: rewritten })

    const { gate, sendText, generateWithInput } = setupGate(rewritten, {
      takeSkillDelegation: skill.takeSkillDelegation,
      peekSkillDelegation: skill.peekSkillDelegation,
    })

    await act(async () => {
      gate.result.current.handleGenerateOrPlan()
      await Promise.resolve()
    })

    // 改写后无委托：local_edit 类会进入确认，不应立刻 sendText
    expect(sendText).not.toHaveBeenCalled()
    expect(generateWithInput).not.toHaveBeenCalled()
    expect(gate.result.current.pendingTurnIntent).not.toBeNull()
  })

  it("委托只用一次，第二次主发送不再带引擎字段", async () => {
    const skill = setupSkillActions()
    act(() => {
      skill.hook.result.current.handleUseSkill(TITLE_REVIEW_SKILL)
    })
    const text = skill.getInput()
    skill.hook.rerender({ input: text })

    const first = setupGate(text, {
      takeSkillDelegation: skill.takeSkillDelegation,
      peekSkillDelegation: skill.peekSkillDelegation,
    })
    await act(async () => {
      first.gate.result.current.handleGenerateOrPlan()
      await vi.waitFor(() => expect(first.sendText).toHaveBeenCalled())
    })
    expect(first.sendText.mock.calls[0][1]).toMatchObject({ executionAgentId: "content_review" })

    const second = setupGate(text, {
      takeSkillDelegation: skill.takeSkillDelegation,
      peekSkillDelegation: skill.peekSkillDelegation,
    })
    await act(async () => {
      second.gate.result.current.handleGenerateOrPlan()
      await Promise.resolve()
    })
    // 第二次：委托已清空，质检文案被判 local_edit → 进确认，不立刻 send
    expect(second.sendText).not.toHaveBeenCalled()
    expect(second.gate.result.current.pendingTurnIntent).not.toBeNull()
  })
})
