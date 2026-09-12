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

  it("distinguishes own-voice from provider tts delivery", () => {
    const original = buildVideoTaskIdempotencyKey(baseInput)
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, voiceSource: "own_voice" })).not.toBe(original)
    // 未声明 voiceSource 与显式 tts 等价（默认值归一）
    expect(buildVideoTaskIdempotencyKey({ ...baseInput, voiceSource: "tts" })).toBe(original)
  })
})
