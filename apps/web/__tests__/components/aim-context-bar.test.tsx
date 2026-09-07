import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimContextBar } from "@/components/aim/aim-context-bar"

describe("AimContextBar", () => {
  it("默认折叠：显示摘要，不渲染内容", () => {
    render(
      <AimContextBar summary="IP 档案 · 本周进展">
        <div>档案详情</div>
      </AimContextBar>,
    )

    expect(screen.getByText("IP 档案 · 本周进展")).toBeTruthy()
    expect(screen.queryByText("档案详情")).toBeNull()
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false")
  })

  it("点击展开内容，再点击收起", async () => {
    const user = userEvent.setup()
    render(
      <AimContextBar summary="IP 档案 · 本周进展">
        <div>档案详情</div>
      </AimContextBar>,
    )

    await user.click(screen.getByRole("button"))
    expect(screen.getByText("档案详情")).toBeTruthy()
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true")

    await user.click(screen.getByRole("button"))
    expect(screen.queryByText("档案详情")).toBeNull()
  })
})
