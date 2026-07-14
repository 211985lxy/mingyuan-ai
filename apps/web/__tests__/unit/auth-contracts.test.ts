import { describe, expect, it } from "vitest"
import { loginBodySchema } from "@/features/auth/contracts"

describe("auth request contracts", () => {
  it("accepts numeric email local parts used by existing accounts", () => {
    const result = loginBodySchema.safeParse({
      email: "1450069849@qq.com",
      password: "123456",
    })

    expect(result.success).toBe(true)
  })

  it("still rejects malformed email addresses", () => {
    const result = loginBodySchema.safeParse({
      email: "invalid email",
      password: "123456",
    })

    expect(result.success).toBe(false)
  })
})
