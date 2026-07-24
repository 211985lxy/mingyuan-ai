/**
 * AimPromptComposer 交互测试。
 *
 * 覆盖：Enter 发送、技能下拉开合与选择、计划模式切换。
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimPromptComposer>> = {}) {
  return {
    value: "写一篇关于供暖改造的小红书",
    placeholder: "说说你的需求",
    busy: false,
    isRecording: false,
    isTranscribing: false,
    isGenerating: false,
    canGenerate: true,
    primaryActionLabel: "生成",
    onChange: vi.fn(),
    onGenerate: vi.fn(),
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    ...overrides,
  }
}

describe("AimPromptComposer", () => {
  it("有内容且可生成时，按 Enter 触发 onGenerate", async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<AimPromptComposer {...props} />)

    const textarea = screen.getByPlaceholderText("说说你的需求")
    await user.click(textarea)
    await user.keyboard("{Enter}")

    expect(props.onGenerate).toHaveBeenCalledTimes(1)
  })

  it("内容为空时按 Enter 不触发生成", async () => {
    const user = userEvent.setup()
    const props = baseProps({ value: "   " })
    render(<AimPromptComposer {...props} />)

    const textarea = screen.getByPlaceholderText("说说你的需求")
    await user.click(textarea)
    await user.keyboard("{Enter}")

    expect(props.onGenerate).not.toHaveBeenCalled()
  })

  it("技能下拉：打开 → 选择技能 → onUseSkill 被调且面板关闭", async () => {
    const user = userEvent.setup()
    const onUseSkill = vi.fn()
    const skills: AimWorkbenchSkill[] = [
      { id: "s1", label: "写小红书", description: "生成小红书图文", prompt: "p1", group: "创作" },
    ]
    render(<AimPromptComposer {...baseProps({ showSkills: true, skills, onUseSkill })} />)

    // 初始未展开
    expect(screen.queryByText("写小红书")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /技能/ }))
    // 展开后可见技能项
    await user.click(screen.getByText("写小红书"))

    expect(onUseSkill).toHaveBeenCalledTimes(1)
    expect(onUseSkill.mock.calls[0][0].id).toBe("s1")
    // 选择后面板关闭
    expect(screen.queryByText("写小红书")).not.toBeInTheDocument()
  })

  it("计划模式切换：direct 下点击「计划」回调 plan", async () => {
    const user = userEvent.setup()
    const onComposerModeChange = vi.fn()
    render(
      <AimPromptComposer
        {...baseProps({ onComposerModeChange, canUsePlanMode: true, composerMode: "direct" })}
      />,
    )

    await user.click(screen.getByRole("button", { name: /计划/ }))
    expect(onComposerModeChange).toHaveBeenCalledWith("plan")
  })
})
