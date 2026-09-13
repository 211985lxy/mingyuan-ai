import { describe, expect, it } from "vitest"
import { buildVideoTaskIdempotencyKey } from "@/lib/video-task-domain"

const baseInput = {
  userId: "user-1",
  projectId: "project-1",
  aimGenerationId: "generation-1",
  avatarId: "avatar-1",
  scriptContent: "  第一行\n\n第二行  ",
  aspectRatio: "9:16" as const,
  provider: "chanjing" as const,
}

describe("video task idempotency", () => {
  it("normalizes whitespace in the immutable script snapshot", () => {
    expect(buildVideoTaskIdempotencyKey(baseInput)).toBe(
      buildVideoTaskIdempotencyKey({
        ...baseInput,
        scriptContent: "第一行 第二行",
      }),
    )
  })

  it("changes when the provider or output ratio changes", () => {
    const original = buildVideoTaskIdempotencyKey(baseInput)
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, provider: "shanjian" })).not.toBe(original)
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, aspectRatio: "16:9" })).not.toBe(original)
  })

  it("supports a new explicit action for a deliberate retry", () => {
    const original = buildVideoTaskIdempotencyKey(baseInput)
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, actionId: "retry-1" })).not.toBe(original)
  })

  it("distinguishes different public digital persons with the same script", () => {
    // 公共数字人没有 DB 记录：若不带供应商形象 id，换个形象会被判成同一单
    const a = buildVideoTaskIdempotencyKey({ ...baseInput, avatarId: null, publicPersonId: "dp-1" })
    const b = buildVideoTaskIdempotencyKey({ ...baseInput, avatarId: null, publicPersonId: "dp-2" })
    expect(a).not.toBe(b)
    // 同一形象仍去重
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, avatarId: null, publicPersonId: "dp-1" })).toBe(a)
  })

  it("keeps existing keys stable when no public person is involved", () => {
    // publicPersonId 缺省不参与键计算，避免改变既有任务的幂等键
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, publicPersonId: null })).toBe(
      buildVideoTaskIdempotencyKey(baseInput),
    )
  })

  it("distinguishes own-voice from provider tts delivery", () => {
    const original = buildVideoTaskIdempotencyKey(baseInput)
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, voiceSource: "own_voice" })).not.toBe(original)
    // 未声明 voiceSource 与显式 tts 等价（默认值归一）
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, voiceSource: "tts" })).toBe(original)
  })
})
