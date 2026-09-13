import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setTag: vi.fn(),
}))

vi.mock("@sentry/nextjs", () => ({
  getCurrentScope: () => ({ setTag: mocks.setTag }),
}))

describe("requestId 进 Sentry trace", () => {
  beforeEach(() => {
    mocks.setTag.mockReset()
  })

  it("createRequestLogger 把 requestId 挂到当前 Sentry scope", async () => {
    const { createRequestLogger } = await import("@/lib/logger")
    createRequestLogger({ requestId: "req-abc", path: "/api/aim/chat" })
    expect(mocks.setTag).toHaveBeenCalledWith("requestId", "req-abc")
  })

  it("空 requestId 不打 tag", async () => {
    const { bindRequestIdToSentry } = await import("@/lib/observability/sentry-scope")
    bindRequestIdToSentry("")
    expect(mocks.setTag).not.toHaveBeenCalled()
  })
})

describe("Sentry 初始化开关", () => {
  it("没有 DSN 时 enabled=false，不会往外发", async () => {
    const previous = process.env.SENTRY_DSN
    const previousPublic = process.env.NEXT_PUBLIC_SENTRY_DSN
    delete process.env.SENTRY_DSN
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
    const { buildSentryInitOptions } = await import("@/lib/observability/sentry-init")
    expect(buildSentryInitOptions()).toMatchObject({ enabled: false, dsn: undefined })
    expect(buildSentryInitOptions({ client: true })).toMatchObject({ enabled: false })
    process.env.SENTRY_DSN = previous
    process.env.NEXT_PUBLIC_SENTRY_DSN = previousPublic
  })

  it("有 DSN 时打开采集，默认不带用户个人信息", async () => {
    process.env.SENTRY_DSN = "https://example.ingest.sentry.io/1"
    const { buildSentryInitOptions } = await import("@/lib/observability/sentry-init")
    expect(buildSentryInitOptions()).toMatchObject({
      enabled: true,
      dsn: "https://example.ingest.sentry.io/1",
      sendDefaultPii: false,
    })
    delete process.env.SENTRY_DSN
  })
})
