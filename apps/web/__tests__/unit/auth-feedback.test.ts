import { describe, expect, it } from "vitest"

import { getActivationAccountLabel } from "@/lib/activation-account"

describe("activation account feedback", () => {
  it("shows the current account email", () => {
    expect(getActivationAccountLabel("owner@example.com")).toBe("owner@example.com")
  })

  it("shows a recovery message instead of a placeholder when the account is unavailable", () => {
    expect(getActivationAccountLabel(null)).toBe("账号信息获取失败，请重新登录")
  })
})
