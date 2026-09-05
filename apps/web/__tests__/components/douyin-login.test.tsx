import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const completeDouyinLogin = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api/auth", () => ({
  completeDouyinLogin,
}))

import {
  DouyinLoginForm,
  DouyinPhoneBindForm,
} from "@/features/auth/login/douyin-login-form"

describe("Douyin login forms", () => {
  it("shows the QR login entry", () => {
    render(<DouyinLoginForm disabled={false} onError={vi.fn()} />)
    expect(screen.getByRole("button", { name: "抖音扫码登录" })).toBeInTheDocument()
  })

  it("submits phone verification for a first-time Douyin login", async () => {
    completeDouyinLogin.mockResolvedValue({ user: { id: "u1" } })
    const user = userEvent.setup()
    const onSuccess = vi.fn()

    render(<DouyinPhoneBindForm disabled={false} onSuccess={onSuccess} onError={vi.fn()} />)
    await user.type(screen.getByLabelText("手机号"), "13800138000")
    await user.type(screen.getByLabelText("验证码"), "123456")
    await user.click(screen.getByRole("button", { name: "绑定手机号并登录" }))

    expect(completeDouyinLogin).toHaveBeenCalledWith("13800138000", "123456")
    expect(onSuccess).toHaveBeenCalledWith({ id: "u1" })
  })
})
