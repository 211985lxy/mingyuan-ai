/**
 * AimTurnIntentConfirmBar 交互测试。
 *
 * 覆盖：直接确认、补充说明后确认（携带 userSupplement）、取消、档案缺口提示。
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimTurnIntentConfirmBar } from "@/components/aim/aim-turn-intent-confirm-bar"
import type { AimTurnIntent } from "@/lib/aim-turn-intent"

const baseIntent: AimTurnIntent = {
  summary: "为供暖改造写一篇小红书图文",
  action: "create",
  scope: "unspecified",
  deliverable: "小红书图文",
  keep: [],
  avoid: [],
  archiveGaps: [],
}

describe("AimTurnIntentConfirmBar", () => {
  it("直接确认：onConfirm 收到原始意图（不带 supplement）", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <AimTurnIntentConfirmBar intent={baseIntent} onConfirm={onConfirm} onCancel={vi.fn()} />,
    )

    await user.click(screen.getByRole("button", { name: /确认并生成/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toEqual(baseIntent)
  })

  it("补充说明后确认：onConfirm 收到携带 userSupplement 的意图", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <AimTurnIntentConfirmBar intent={baseIntent} onConfirm={onConfirm} onCancel={vi.fn()} />,
    )

    // 展开补充说明输入框
    await user.click(screen.getByRole("button", { name: /补充说明/ }))
    const textarea = screen.getByPlaceholderText(/语气再口语一点/)
    await user.type(textarea, "语气再口语一点")

    await user.click(screen.getByRole("button", { name: /确认并生成/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const confirmed = onConfirm.mock.calls[0][0] as AimTurnIntent
    expect(confirmed.userSupplement).toBe("语气再口语一点")
    // 补充说明不改结构化字段
    expect(confirmed.action).toBe(baseIntent.action)
    expect(confirmed.scope).toBe(baseIntent.scope)
  })

  it("取消：触发 onCancel 且不触发 onConfirm", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <AimTurnIntentConfirmBar intent={baseIntent} onConfirm={onConfirm} onCancel={onCancel} />,
    )

    await user.click(screen.getByRole("button", { name: /取消/ }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("存在档案缺口时按钮文案为「仍要生成」并展示缺口列表", () => {
    const intentWithGaps: AimTurnIntent = {
      ...baseIntent,
      archiveGaps: ["缺少具体卖点", "缺少客户案例"],
    }
    render(
      <AimTurnIntentConfirmBar intent={intentWithGaps} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole("button", { name: /仍要生成/ })).toBeInTheDocument()
    expect(screen.getByText("缺少具体卖点")).toBeInTheDocument()
    expect(screen.getByText("缺少客户案例")).toBeInTheDocument()
  })
})
