import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimMessageStream } from "@/components/aim/aim-message-stream"

vi.mock("@/components/aim/aim-deliverable-bubble", () => ({
  AimDeliverableBubble: () => null,
}))
vi.mock("@/components/aim/aim-run-outcome-select-items", () => ({
  AimRunOutcomeActions: () => null,
}))
vi.mock("@/components/aim/aim-message-jump-rail", () => ({
  AimMessageJumpRail: () => null,
}))

function baseActions() {
  return {
    onSubmitChoice: vi.fn(),
    onRetry: vi.fn(),
    onApplyReplacement: vi.fn(),
    onRepurpose: vi.fn(() => vi.fn()),
    onQuality: vi.fn(() => vi.fn()),
    onMarkStatus: vi.fn(() => vi.fn()),
    onFinalDisposition: vi.fn(() => vi.fn()),
    onNextAction: vi.fn(),
    onOpenRecord: vi.fn(),
    onCompileToWiki: vi.fn(),
    onInlineContentSaved: vi.fn(),
    onInlineSelectionRewrite: vi.fn(),
  }
}

describe("空状态快捷指令", () => {
  it("渲染快捷 chip，点击后触发 onSubmitChoice", async () => {
    const user = userEvent.setup()
    const actions = baseActions()
    render(
      <AimMessageStream
        messages={[]}
        busy={false}
        agentIntro="这里是内容文案创作。"
        workflowStage="content"
        selectedAgentId="content_producer"
        selectedProjectId=""
        quickPrompts={["粘贴对标文案，帮我拆解重写", "口述一个选题"]}
        actions={actions}
      />,
    )

    await user.click(screen.getByRole("button", { name: "粘贴对标文案，帮我拆解重写" }))
    expect(actions.onSubmitChoice).toHaveBeenCalledWith("粘贴对标文案，帮我拆解重写")
  })

  it("最多展示 3 个 chip", () => {
    render(
      <AimMessageStream
        messages={[]}
        busy={false}
        agentIntro="简介"
        workflowStage="content"
        selectedAgentId="content_producer"
        selectedProjectId=""
        quickPrompts={["甲", "乙", "丙", "丁"]}
        actions={baseActions()}
      />,
    )

    expect(screen.getByRole("button", { name: "丙" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "丁" })).toBeNull()
  })
})
