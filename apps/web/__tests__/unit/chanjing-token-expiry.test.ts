import { describe, expect, it } from "vitest"
import { resolveAccessTokenExpiry } from "@/lib/chanjing"

const NOW = 1_789_000_000_000 // 固定基准，避免依赖真实时钟
const MIN = 60_000
const MAX = 6 * 60 * 60 * 1000

describe("access_token 有效期解析", () => {
  it("按绝对秒级时间戳解释（供应商实测形态）", () => {
    // 1789382258 ≈ 2026-09-14T05:57Z，即约 24 小时后
    const expiresAt = resolveAccessTokenExpiry(1_789_382_258, NOW)
    // 不应被当成 56 年的时长；仍受 6 小时上限钳制
    expect(expiresAt).toBe(NOW + MAX)
  })

  it("按毫秒级时间戳解释", () => {
    expect(resolveAccessTokenExpiry(1_789_382_258_000, NOW)).toBe(NOW + MAX)
  })

  it("较短的相对秒数按原值采用（如 2 小时）", () => {
    expect(resolveAccessTokenExpiry(7_200, NOW)).toBe(NOW + 7_200_000)
  })

  it("异常远期值被钳到上限，避免缓存“永久”令牌", () => {
    expect(resolveAccessTokenExpiry(9_999_999_999_999, NOW)).toBe(NOW + MAX)
    expect(resolveAccessTokenExpiry(1e15, NOW)).toBe(NOW + MAX)
  })

  it("过小或缺失的值给保守下限，而不是立刻过期", () => {
    expect(resolveAccessTokenExpiry(1, NOW)).toBe(NOW + MIN)
    expect(resolveAccessTokenExpiry(0, NOW)).toBe(NOW + 5 * 60 * 1000)
    expect(resolveAccessTokenExpiry(null, NOW)).toBe(NOW + 5 * 60 * 1000)
    expect(resolveAccessTokenExpiry(undefined, NOW)).toBe(NOW + 5 * 60 * 1000)
    expect(resolveAccessTokenExpiry(Number.NaN, NOW)).toBe(NOW + 5 * 60 * 1000)
  })

  it("结果永远落在 [now+1min, now+6h] 区间内", () => {
    for (const raw of [1, 300, 7_200, 86_400, 1_789_382_258, 1_789_382_258_000, 1e15]) {
      const expiresAt = resolveAccessTokenExpiry(raw, NOW)
      expect(expiresAt).toBeGreaterThanOrEqual(NOW + MIN)
      expect(expiresAt).toBeLessThanOrEqual(NOW + MAX)
    }
  })
})
