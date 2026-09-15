import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ConfirmProvider, useConfirm } from "@/components/ui/confirm-dialog"

/** 触发确认的最小宿主：把 confirm 的返回值记录下来供断言。 */
function ConfirmHarness({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirm({
          title: "删除这条素材？",
          description: "删除后不可恢复。",
          confirmText: "删除",
          destructive: true,
        })
        onResult(ok)
      }}
    >
      触发
    </button>
  )
}

describe("ConfirmProvider", () => {
  it("初始不显示对话框", () => {
    render(
      <ConfirmProvider>
        <ConfirmHarness onResult={vi.fn()} />
      </ConfirmProvider>,
    )
    expect(screen.queryByText("删除这条素材？")).toBeNull()
  })

  it("触发后显示标题、说明与自定义按钮文案", async () => {
    const user = userEvent.setup()
    render(
      <ConfirmProvider>
        <ConfirmHarness onResult={vi.fn()} />
      </ConfirmProvider>,
    )

    await user.click(screen.getByRole("button", { name: "触发" }))

    expect(await screen.findByText("删除这条素材？")).toBeTruthy()
    expect(screen.getByText("删除后不可恢复。")).toBeTruthy()
    expect(screen.getByRole("button", { name: "删除" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy()
  })

  it("点确认：resolve(true) 且对话框关闭", async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(
      <ConfirmProvider>
        <ConfirmHarness onResult={onResult} />
      </ConfirmProvider>,
    )

    await user.click(screen.getByRole("button", { name: "触发" }))
    await user.click(await screen.findByRole("button", { name: "删除" }))

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
    await waitFor(() => expect(screen.queryByText("删除这条素材？")).toBeNull())
  })

  it("点取消：resolve(false)", async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(
      <ConfirmProvider>
        <ConfirmHarness onResult={onResult} />
      </ConfirmProvider>,
    )

    await user.click(screen.getByRole("button", { name: "触发" }))
    await user.click(await screen.findByRole("button", { name: "取消" }))

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
  })

  it("Escape 关闭视为取消（不误判为确认）", async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(
      <ConfirmProvider>
        <ConfirmHarness onResult={onResult} />
      </ConfirmProvider>,
    )

    await user.click(screen.getByRole("button", { name: "触发" }))
    await screen.findByText("删除这条素材？")
    await user.keyboard("{Escape}")

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
  })

  it("未挂 Provider 时降级为原生确认，不崩溃也不静默通过", async () => {
    const user = userEvent.setup()
    const nativeConfirm = vi.fn().mockReturnValue(true)
    vi.stubGlobal("confirm", nativeConfirm)
    const onResult = vi.fn()

    render(<ConfirmHarness onResult={onResult} />)
    await user.click(screen.getByRole("button", { name: "触发" }))

    await waitFor(() => expect(nativeConfirm).toHaveBeenCalledTimes(1))
    // 文案仍完整传给用户，不只是标题
    expect(String(nativeConfirm.mock.calls[0][0])).toContain("删除后不可恢复")
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
    vi.unstubAllGlobals()
  })
})
