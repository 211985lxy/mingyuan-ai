import { describe, it, expect } from "vitest"
import { detectPersonaMode } from "@/lib/aim-agent-handlers"

describe("detectPersonaMode", () => {
  // ── intake mode: interview/intake keywords ──
  it('returns "intake" for "帮我整理一下前采记录"', () => {
    expect(detectPersonaMode("帮我整理一下前采记录")).toBe("intake")
  })

  it('returns "intake" for "这是访谈录音转文字"', () => {
    expect(detectPersonaMode("这是访谈录音转文字")).toBe("intake")
  })

  it('returns "intake" for "前采资料整理"', () => {
    expect(detectPersonaMode("前采资料整理")).toBe("intake")
  })

  // ── guided mode: default / no intake keywords ──
  it('returns "guided" for "我想做个人IP"', () => {
    expect(detectPersonaMode("我想做个人IP")).toBe("guided")
  })

  it('returns "guided" for empty string', () => {
    expect(detectPersonaMode("")).toBe("guided")
  })

  // ── intake_compile mode: "开始整理" trigger ──
  it('returns "intake_compile" for "开始整理"', () => {
    expect(detectPersonaMode("开始整理")).toBe("intake_compile")
  })

  it('returns "intake_compile" for "已发完，开始整理"', () => {
    expect(detectPersonaMode("已发完，开始整理")).toBe("intake_compile")
  })
})
