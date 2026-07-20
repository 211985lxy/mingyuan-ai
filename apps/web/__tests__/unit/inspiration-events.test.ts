import { beforeEach, describe, expect, it, vi } from "vitest"

const runtimeEnv = vi.hoisted(() => ({
  FEISHU_TOPIC_PIPELINE_ENABLED: undefined as string | undefined,
  WORKBUDDY_WECHAT_ENABLED: undefined as string | undefined,
  WECOM_INSPIRATION_ENABLED: undefined as string | undefined,
  INSPIRATION_PIPELINE_SHADOW_MODE: undefined as string | undefined,
}))

vi.mock("@/env", () => ({ env: runtimeEnv }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/background-tasks", () => ({ enqueueBackgroundTask: vi.fn() }))
vi.mock("@/lib/background-task-runtime", () => ({ areBackgroundTasksEnabled: () => true }))

import { buildInspirationDedupeKey, isInspirationPlatformEnabled, isInspirationShadowMode } from "@/features/topics/services/inspiration-events"

describe("inspiration event contract", () => {
  beforeEach(() => {
    runtimeEnv.FEISHU_TOPIC_PIPELINE_ENABLED = undefined
    runtimeEnv.WORKBUDDY_WECHAT_ENABLED = undefined
    runtimeEnv.WECOM_INSPIRATION_ENABLED = undefined
    runtimeEnv.INSPIRATION_PIPELINE_SHADOW_MODE = undefined
  })

  it("uses the platform message id as the stable dedupe key", () => {
    const key = buildInspirationDedupeKey({
      platform: "workbuddy_wechat",
      externalMessageId: "message-1",
      externalChatId: "chat-1",
      externalSenderId: "sender-1",
      content: "收选题 https://v.douyin.com/demo/",
      occurredAt: "2026-07-20T12:00:00.000Z",
    })
    expect(key).toBe("workbuddy_wechat:message-1")
  })

  it("deduplicates missing message ids in five-minute buckets", () => {
    const base = {
      platform: "workbuddy_wechat" as const,
      externalChatId: "chat-1",
      externalSenderId: "sender-1",
      content: "收选题   https://v.douyin.com/demo/",
    }
    const first = buildInspirationDedupeKey({ ...base, occurredAt: "2026-07-20T12:01:00.000Z" })
    const duplicate = buildInspirationDedupeKey({ ...base, content: "收选题 https://v.douyin.com/demo/", occurredAt: "2026-07-20T12:04:59.000Z" })
    const later = buildInspirationDedupeKey({ ...base, occurredAt: "2026-07-20T12:05:00.000Z" })
    expect(duplicate).toBe(first)
    expect(later).not.toBe(first)
  })

  it("fails closed for WorkBuddy and WeCom while Feishu remains compatible", () => {
    expect(isInspirationPlatformEnabled("feishu")).toBe(true)
    expect(isInspirationPlatformEnabled("workbuddy_wechat")).toBe(false)
    expect(isInspirationPlatformEnabled("wecom")).toBe(false)
    runtimeEnv.WORKBUDDY_WECHAT_ENABLED = "true"
    runtimeEnv.WECOM_INSPIRATION_ENABLED = "true"
    expect(isInspirationPlatformEnabled("workbuddy_wechat")).toBe(true)
    expect(isInspirationPlatformEnabled("wecom")).toBe(true)
  })

  it("exposes the rollout shadow switch", () => {
    expect(isInspirationShadowMode()).toBe(false)
    runtimeEnv.INSPIRATION_PIPELINE_SHADOW_MODE = "true"
    expect(isInspirationShadowMode()).toBe(true)
  })
})
