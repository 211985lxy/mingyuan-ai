import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 失败落库必须能回答「是哪一跳吃掉了预算」。
 *
 * 回归背景（2026-09）：整条模型链总预算 115 秒，用户反复遇到「等满 115 秒 →
 * 错误码 3」。但 trace 只记最后一跳（provider/model/fallbackIndex），
 * 逐跳耗时虽然收集在内存里、挂在错误对象上，却从没写进库 —— 于是无法判断
 * 是 zenmux 每次卡满 30 秒，还是四跳平均分摊。修这个问题缺的不是猜，是证据。
 */

const { traceUpdate } = vi.hoisted(() => ({
  traceUpdate: vi.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({})),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { aimExecutionTrace: { update: traceUpdate, findUnique: vi.fn(async () => null) } },
}))
vi.mock("@/lib/redis", () => ({ redis: { publish: vi.fn(async () => 1) } }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/audit-events", () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  specialistAuditInput: vi.fn(() => ({})),
}))
vi.mock("@/lib/account-project-isolation-metrics", () => ({
  incrementIsolationMetric: vi.fn(async () => undefined),
  normalizeIsolationEntryType: vi.fn((value: unknown) => value),
}))

import { failAimTrace, formatProviderAttemptTrail } from "@/lib/aim-observability"
import { AimRunExecutionError } from "@/lib/aim-error-message"
import type { ProviderAttempt } from "@/lib/llm/telemetry"

function attempt(over: Partial<ProviderAttempt> & { provider: string }): ProviderAttempt {
  return { status: "failed", attemptIndex: 0, ...over }
}

describe("逐跳线路轨迹", () => {
  it("把每跳的线路、失败类型与耗时串成可读轨迹", () => {
    const trail = formatProviderAttemptTrail([
      attempt({ provider: "zenmux", errorKind: "timeout", durationMs: 30001, attemptIndex: 0 }),
      attempt({ provider: "deepseek", errorKind: "timeout", durationMs: 45002, attemptIndex: 1 }),
      attempt({ provider: "apimart", status: "success", durationMs: 8000, attemptIndex: 2 }),
    ])
    expect(trail).toBe("zenmux:timeout:30001ms → deepseek:timeout:45002ms → apimart:success:8000ms")
  })

  it("没有尝试记录时返回空串", () => {
    expect(formatProviderAttemptTrail([])).toBe("")
  })

  it("异常长的链有长度上限，不挤掉根因", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      attempt({ provider: `provider-${index}`, errorKind: "timeout", durationMs: 1000, attemptIndex: index }))
    expect(formatProviderAttemptTrail(many).length).toBeLessThanOrEqual(400)
  })
})

describe("失败落库带上逐跳轨迹", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("errorMessage 同时含根因与整条线路轨迹", async () => {
    const error = new AimRunExecutionError({
      code: "MODEL_TIMEOUT",
      runId: "run-1",
      providerAttempts: [
        attempt({ provider: "zenmux", errorKind: "timeout", durationMs: 30001, attemptIndex: 0 }),
        attempt({ provider: "deepseek", errorKind: "timeout", durationMs: 45002, attemptIndex: 1 }),
      ],
    })

    await failAimTrace({ id: "trace-1", startedAt: Date.now() - 115_000 }, error)

    const data = traceUpdate.mock.calls[0]?.[0]?.data ?? {}
    expect(data.errorCode).toBe("MODEL_TIMEOUT")
    // 跳数与终点仍照旧记录
    expect(data.fallbackIndex).toBe(1)
    expect(Number(data.durationMs)).toBeGreaterThanOrEqual(115_000)
    // 新增：整条轨迹，能看出两跳各自吃掉多少
    expect(String(data.errorMessage)).toContain("线路:")
    expect(String(data.errorMessage)).toContain("zenmux:timeout:30001ms")
    expect(String(data.errorMessage)).toContain("deepseek:timeout:45002ms")
  })

  it("没有尝试记录时不追加轨迹段（既有行为不变）", async () => {
    const error = new AimRunExecutionError({ code: "INVALID_REQUEST", runId: "run-2" })

    await failAimTrace({ id: "trace-2", startedAt: Date.now() }, error)

    const data = traceUpdate.mock.calls[0]?.[0]?.data ?? {}
    expect(String(data.errorMessage)).not.toContain("线路:")
  })
})
