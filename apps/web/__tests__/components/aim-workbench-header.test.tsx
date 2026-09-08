import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimWorkbenchHeader } from "@/components/aim/aim-workbench-header"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimWorkbenchHeader>> = {}) {
  return {
    workflowStage: "content" as const,
    agentTitle: "内容创作",
    AgentIcon: () => <span data-testid="agent-icon" />,
    showStageProgress: true,
    onStageChange: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  }
}

describe("AimWorkbenchHeader 阶段条", () => {
  it("点击非当前阶段触发 onStageChange", async () => {
    const user = userEvent.setup()
    const onStageChange = vi.fn()
    render(<AimWorkbenchHeader {...baseProps({ onStageChange })} />)

    await user.click(screen.getByRole("button", { name: "切换到发作品" }))
    expect(onStageChange).toHaveBeenCalledWith("publish")
  })

  it("当前阶段不作为按钮渲染，且带 aria-current=step", () => {
    render(<AimWorkbenchHeader {...baseProps()} />)

    expect(screen.queryByRole("button", { name: "切换到做内容" })).toBeNull()
    const currentStage = screen
      .getAllByText("做内容")
      .find((el) => el.closest("[aria-current='step']"))
    expect(currentStage).toBeTruthy()
  })

  it("不传 onStageChange 时所有阶段均为只读", () => {
    render(<AimWorkbenchHeader {...baseProps({ onStageChange: undefined })} />)

    expect(screen.queryByRole("button", { name: /切换到/ })).toBeNull()
  })
})
