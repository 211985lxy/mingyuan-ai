/**
 * 基建冒烟测试：验证 jsdom + React Testing Library 环境可用。
 *
 * 关键点：
 * - useEffect 能运行（node 环境的 renderToStaticMarkup 做不到）
 * - 能模拟点击并断言状态更新后的 DOM
 * - sonner toast 已被全局 mock
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, useState } from "react"
import { toast } from "sonner"

function Counter() {
  const [count, setCount] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // 冒烟测试有意使用「effect 内 setState」模式：它验证的正是 jsdom 基建
    // 能跑 effect 并驱动重渲染（node 环境的 renderToStaticMarkup 做不到）。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 见上：这是被验证的能力本身
    setMounted(true)
  }, [])

  return (
    <div>
      <span data-testid="mounted">{mounted ? "yes" : "no"}</span>
      <span data-testid="count">{count}</span>
      <button onClick={() => setCount((c) => c + 1)}>increment</button>
      <button onClick={() => toast.success("done")}>notify</button>
    </div>
  )
}

describe("component test infra smoke", () => {
  it("runs useEffect on mount", () => {
    render(<Counter />)
    expect(screen.getByTestId("mounted")).toHaveTextContent("yes")
  })

  it("handles click interaction and state update", async () => {
    const user = userEvent.setup()
    render(<Counter />)
    await user.click(screen.getByText("increment"))
    await user.click(screen.getByText("increment"))
    expect(screen.getByTestId("count")).toHaveTextContent("2")
  })

  it("has sonner toast mocked", async () => {
    const user = userEvent.setup()
    render(<Counter />)
    await user.click(screen.getByText("notify"))
    expect(toast.success).toHaveBeenCalledWith("done")
    vi.mocked(toast.success).mockClear()
  })
})
