import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// validateCronSecret 直接单元测试。
// @t3-oss/env-nextjs 在模块加载时对 process.env 做一次性快照（runtimeEnv 仅 import 时求值），
// setupFiles(setup-env.ts) 已先把 CRON_SECRET 冻结为非空值，故默认场景下 env.CRON_SECRET 非空。
// 要测 fail-closed（密钥未配置）必须 resetModules 后在重新 import 前清空 process.env。

const FROZEN_SECRET = "test-unit-cron-secret-at-least-32-bytes"

function makeRequest(token?: string): NextRequest {
  const headers = new Headers()
  if (token !== undefined) headers.set("authorization", token)
  return new NextRequest("http://localhost/api/cron/x", { headers })
}

describe("validateCronSecret", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = FROZEN_SECRET
  })

  afterEach(() => {
    process.env.CRON_SECRET = FROZEN_SECRET
    vi.resetModules()
  })

  it("正确 Bearer 密钥通过", async () => {
    const { validateCronSecret } = await import("@/lib/admin-auth")
    expect(validateCronSecret(makeRequest(`Bearer ${FROZEN_SECRET}`))).toBe(true)
  })

  it("错误密钥拒绝", async () => {
    const { validateCronSecret } = await import("@/lib/admin-auth")
    expect(validateCronSecret(makeRequest("Bearer wrong-secret-value-here-xxxxx"))).toBe(false)
  })

  it("缺 Authorization 头拒绝", async () => {
    const { validateCronSecret } = await import("@/lib/admin-auth")
    expect(validateCronSecret(makeRequest(undefined))).toBe(false)
  })

  it("非 Bearer 头拒绝", async () => {
    const { validateCronSecret } = await import("@/lib/admin-auth")
    expect(validateCronSecret(makeRequest(FROZEN_SECRET))).toBe(false)
    expect(validateCronSecret(makeRequest(`Basic ${FROZEN_SECRET}`))).toBe(false)
  })

  it("前缀相同但更短的密钥仍拒绝（长度不等不泄露）", async () => {
    const { validateCronSecret } = await import("@/lib/admin-auth")
    expect(validateCronSecret(makeRequest(`Bearer ${FROZEN_SECRET.slice(0, 10)}`))).toBe(false)
  })

  it("CRON_SECRET 未配置 → fail-closed 拒绝", async () => {
    delete process.env.CRON_SECRET
    const { validateCronSecret } = await import("@/lib/admin-auth")
    expect(validateCronSecret(makeRequest(`Bearer ${FROZEN_SECRET}`))).toBe(false)
  })
})
