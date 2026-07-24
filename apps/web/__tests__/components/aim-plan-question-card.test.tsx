/**
 * AimPlanQuestionCard 交互测试。
 *
 * 覆盖：选择档案选项、D 自定义补充确认、返回上一题、空选项时的兜底文案。
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimPlanQuestionCard } from "@/components/aim/aim-plan-question-card"
import type { PlanQuestion } from "@/lib/aim/plan-types"

const question = {
  id: "q1",
  dimension: "core_message",
  prompt: "这次内容最想传递的核心观点是什么？",
  options: [
    { key: "A", text: "供暖改造省钱", sourceRefs: [{ kind: "knowledge", id: "k1", label: "客户痛点条目" }] },
    { key: "B", text: "供暖改造省心", sourceRefs: [{ kind: "ip_wiki", id: "w1", label: "目标人群 Wiki" }] },
  ],
  hasCustomOption: true,
  targetField: "coreMessage",
} as unknown as PlanQuestion

function baseProps(overrides: Partial<React.ComponentProps<typeof AimPlanQuestionCard>> = {}) {
  return {
    question,
    questionNumber: 1,
    totalQuestions: 3,
    loading: false,
    canGoBack: false,
    onSelectOption: vi.fn(),
    onSelectCustom: vi.fn(),
    onGoBack: vi.fn(),
    ...overrides,
  }
}

describe("AimPlanQuestionCard", () => {
  it("点击档案选项：onSelectOption 收到问题 ID 与选项键", async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<AimPlanQuestionCard {...props} />)

    await user.click(screen.getByText("供暖改造省钱"))
    expect(props.onSelectOption).toHaveBeenCalledWith("q1", "A")
  })

  it("D 自定义补充：展开输入 → 填写 → 确认后回调携带文本", async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<AimPlanQuestionCard {...props} />)

    await user.click(screen.getByText("都不符合，我来补充"))
    const textarea = screen.getByPlaceholderText("输入你的想法…")
    await user.type(textarea, "我想强调节能改造的长期收益")
    await user.click(screen.getByRole("button", { name: /确认/ }))

    expect(props.onSelectCustom).toHaveBeenCalledWith("q1", "我想强调节能改造的长期收益")
  })

  it("D 自定义补充为空时确认按钮禁用，不触发回调", async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<AimPlanQuestionCard {...props} />)

    await user.click(screen.getByText("都不符合，我来补充"))
    const confirmButton = screen.getByRole("button", { name: /确认/ })
    expect(confirmButton).toBeDisabled()
    expect(props.onSelectCustom).not.toHaveBeenCalled()
  })

  it("canGoBack 为 true 时点击返回按钮触发 onGoBack", async () => {
    const user = userEvent.setup()
    const props = baseProps({ canGoBack: true, questionNumber: 2 })
    render(<AimPlanQuestionCard {...props} />)

    await user.click(screen.getByRole("button", { name: "返回上一题" }))
    expect(props.onGoBack).toHaveBeenCalledTimes(1)
  })

  it("档案无选项时 D 文案为「档案暂无可靠选项，我来补充」", () => {
    const emptyQuestion = { ...question, options: [] } as unknown as PlanQuestion
    render(<AimPlanQuestionCard {...baseProps({ question: emptyQuestion })} />)
    expect(screen.getByText("档案暂无可靠选项，我来补充")).toBeInTheDocument()
  })
})
