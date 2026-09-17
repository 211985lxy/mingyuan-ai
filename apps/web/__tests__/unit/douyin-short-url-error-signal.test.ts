/**
 * 短链探测的**失败信号**回归。
 *
 * 历史缺陷：`resolveDouyinShortUrl` 只对 `SsrfBlockedError` 打点，其余运行期异常
 * （如钉 IP 回调与 Node autoSelectFamily 不兼容抛出的 ERR_INVALID_IP_ADDRESS）
 * 被静默吞掉 —— 业务上只表现为「短链统计恒为零」，日志与指标上零信号。
 * 本文件锁死：任何非 SSRF 拦截的失败都必须留下可观测信号。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/ssrf-guard.server", () => ({
  probeRedirect: vi.fn(),
  SsrfBlockedError: class SsrfBlockedError extends Error {},
}))

vi.mock("@/lib/security-metrics", () => ({
  incrementSecurityMetric: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { logger } from "@/lib/logger"
import { incrementSecurityMetric } from "@/lib/security-metrics"
import { SsrfBlockedError, probeRedirect } from "@/lib/ssrf-guard.server"
import { resolveDouyinShortUrl } from "@/lib/douyin-short-url-resolver"

const SHORT_URL = "https://v.douyin.com/iAbCdEf/"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveDouyinShortUrl —— 失败信号", () => {
  it("运行期失败（非 SSRF 拦截）必须留信号，而不是静默降级", async () => {
    // 复刻真实故障：钉 IP 回调签名不兼容 → ERR_INVALID_IP_ADDRESS
    const runtimeError = new TypeError("fetch failed")
    ;(runtimeError as TypeError & { cause?: unknown }).cause = { code: "ERR_INVALID_IP_ADDRESS" }
    vi.mocked(probeRedirect).mockRejectedValueOnce(runtimeError)

    const result = await resolveDouyinShortUrl(SHORT_URL)

    expect(result).toBe(SHORT_URL) // 仍然降级，不向上抛
    expect(vi.mocked(incrementSecurityMetric)).toHaveBeenCalledWith("ssrf.short_url_error", {
      reason: "unexpected",
    })
    expect(vi.mocked(logger.warn)).toHaveBeenCalled()
    // 不能误报成 SSRF 拦截
    expect(vi.mocked(incrementSecurityMetric)).not.toHaveBeenCalledWith(
      "ssrf.blocked",
      expect.anything(),
    )
  })

  it("SSRF 拦截仍归到 ssrf.blocked", async () => {
    vi.mocked(probeRedirect).mockRejectedValueOnce(new SsrfBlockedError("目标解析到内网/保留地址，已拒绝"))

    const result = await resolveDouyinShortUrl(SHORT_URL)

    expect(result).toBe(SHORT_URL)
    expect(vi.mocked(incrementSecurityMetric)).toHaveBeenCalledWith("ssrf.blocked", {
      reason: "douyin_short_url",
    })
    expect(vi.mocked(incrementSecurityMetric)).not.toHaveBeenCalledWith(
      "ssrf.short_url_error",
      expect.anything(),
    )
  })

  it("探测成功时返回长链且不打失败点", async () => {
    vi.mocked(probeRedirect).mockResolvedValueOnce("https://www.douyin.com/video/7123456789012345678")

    const result = await resolveDouyinShortUrl(SHORT_URL)

    expect(result).toBe("https://www.douyin.com/video/7123456789012345678")
    expect(vi.mocked(incrementSecurityMetric)).not.toHaveBeenCalled()
  })

  it("非短链 URL 直接原样返回，不触发任何探测", async () => {
    const result = await resolveDouyinShortUrl("https://www.douyin.com/video/123")

    expect(result).toBe("https://www.douyin.com/video/123")
    expect(vi.mocked(probeRedirect)).not.toHaveBeenCalled()
  })
})
