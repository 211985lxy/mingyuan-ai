import { describe, expect, it } from "vitest"

import {
  normalizeConfirmedTurnIntent,
  resolveAimTurnIntent,
} from "@/lib/aim-turn-intent"

describe("aim turn intent — interview_build_profile / ip_profile", () => {
  it("routes 开始采访 to interview_build_profile with scope ip_profile", () => {
    const result = resolveAimTurnIntent({ rawInput: "开始采访" })

    expect(result.action).toBe("interview_build_profile")
    expect(result.scope).toBe("ip_profile")
    expect(result.deliverable).toBe("IP 画像采访结构化 JSON")
  })

  it("routes 帮我做老板说明书 to interview_build_profile", () => {
    const result = resolveAimTurnIntent({ rawInput: "帮我做老板说明书" })

    expect(result.action).toBe("interview_build_profile")
    expect(result.scope).toBe("ip_profile")
  })

  it("passes confirmedTurnIntent filter for {action:interview_build_profile, scope:ip_profile}", () => {
    const confirmed = normalizeConfirmedTurnIntent({
      action: "interview_build_profile",
      scope: "ip_profile",
      summary: "本轮意图：老板说明书采访建档——结构化六维问答",
      deliverable: "IP 画像采访结构化 JSON",
      keep: ["六维覆盖"],
      avoid: ["编造事实"],
    })

    expect(confirmed).not.toBeNull()
    expect(confirmed?.action).toBe("interview_build_profile")
    expect(confirmed?.scope).toBe("ip_profile")
  })

  it("does NOT regress: 写一篇文案 still routes to create / full", () => {
    const result = resolveAimTurnIntent({ rawInput: "写一篇文案，讲一讲如何做私域" })

    expect(result.action).toBe("create")
    expect(result.scope).toBe("full")
    expect(result.action).not.toBe("interview_build_profile")
  })
})
