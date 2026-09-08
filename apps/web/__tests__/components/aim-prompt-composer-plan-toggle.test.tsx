import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { getAimAgentCapabilities } from "@/lib/aim/agent-capabilities"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimPromptComposer>> = {}) {
  return {
    value: "",
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
    composerMode: "direct" as const,
    canUsePlanMode: true,
    onComposerModeChange: vi.fn(),
    capabilities: getAimAgentCapabilities("content_producer"),
    ...overrides,
  }
}

describe("composer 计划模式开关", () => {
  it("direct 模式下点击「先确认再生成」切换到 plan", async () => {
    const user = userEvent.setup()
    const onComposerModeChange = vi.fn()
    render(<AimPromptComposer {...baseProps({ onComposerModeChange })} />)

    await user.click(screen.getByRole("button", { name: /先确认再生成/ }))
    expect(onComposerModeChange).toHaveBeenCalledWith("plan")
  })

  it("plan 模式下开关显示已启用，点击切回 direct", async () => {
    const user = userEvent.setup()
    const onComposerModeChange = vi.fn()
    render(<AimPromptComposer {...baseProps({ composerMode: "plan", onComposerModeChange })} />)

    await user.click(screen.getByRole("button", { name: /先确认 · 已启用/ }))
    expect(onComposerModeChange).toHaveBeenCalledWith("direct")
  })

  it("canUsePlanMode 为 false 时不渲染开关", () => {
    render(<AimPromptComposer {...baseProps({ canUsePlanMode: false })} />)

    expect(screen.queryByRole("button", { name: /先确认/ })).toBeNull()
  })
})
