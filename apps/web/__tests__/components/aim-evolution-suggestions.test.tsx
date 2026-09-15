import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimEvolutionSuggestions } from "@/components/aim/aim-workbench-chrome"
import type { AimEvolutionSuggestion } from "@/lib/api/client"

const suggestion = {
  category: "preference",
  title: "偏好：先结论后论据",
  content: "客户希望开场先给结论",
  tags: ["偏好"],
} as AimEvolutionSuggestion

describe("AimEvolutionSuggestions 写入知识库", () => {
  it("请求飞行期间重复点击只提交一次（防重复写入）", async () => {
    const user = userEvent.setup()
    let resolveSave: (() => void) | null = null
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )

    render(
      <AimEvolutionSuggestions suggestions={[suggestion]} onDismiss={vi.fn()} onSave={onSave} />,
    )

    const button = screen.getByRole("button", { name: "写入知识库" })
    await user.click(button)
    await user.click(button)
    await user.click(button)

    // 首次点击后尚未完成，后续点击不得再次触发
    expect(onSave).toHaveBeenCalledTimes(1)

    resolveSave?.()
    await waitFor(() => expect(screen.getByRole("button", { name: "写入知识库" })).toBeTruthy())
  })

  it("保存中按钮禁用并显示进行中文案", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(() => new Promise<void>(() => {}))

    render(
      <AimEvolutionSuggestions suggestions={[suggestion]} onDismiss={vi.fn()} onSave={onSave} />,
    )

    await user.click(screen.getByRole("button", { name: "写入知识库" }))

    const pending = await screen.findByRole("button", { name: "写入中…" })
    expect((pending as HTMLButtonElement).disabled).toBe(true)
  })

  it("写入失败后释放状态，允许重试", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error("网络错误"))
      .mockResolvedValueOnce(undefined)

    render(
      <AimEvolutionSuggestions suggestions={[suggestion]} onDismiss={vi.fn()} onSave={onSave} />,
    )

    await user.click(screen.getByRole("button", { name: "写入知识库" }))
    // 失败后恢复可点，用户可重试
    const retry = await screen.findByRole("button", { name: "写入知识库" })
    await user.click(retry)

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  })
})
