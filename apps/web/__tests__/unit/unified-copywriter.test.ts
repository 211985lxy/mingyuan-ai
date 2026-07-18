import { describe, expect, it } from "vitest"

import { getAgentHandler } from "@/lib/aim-agent-handlers"
import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import { getAimAgent, isValidAimAgent, normalizeAimAgentId, AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"

describe("文案创作官（统一创作入口）", () => {
  it("copywriter 是合法智能体并注册到统一 handler", () => {
    expect(isValidAimAgent("copywriter")).toBe(true)
    expect(getAgentHandler("copywriter").agentId).toBe("copywriter")
  })

  it("UI 只展示文案创作官一张创作卡，三张旧卡隐藏但仍合法", () => {
    const visible = AIM_AGENT_OPTIONS.filter((a) => !a.hidden).map((a) => a.id)
    expect(visible).toContain("copywriter")
    expect(visible).not.toContain("content_producer")
    expect(visible).not.toContain("free_copywriter")
    expect(visible).not.toContain("deep_copywriter")

    // 旧 id 仍可解析（旧会话/旧书签兼容）
    for (const legacyId of ["content_producer", "free_copywriter", "deep_copywriter"]) {
      expect(isValidAimAgent(legacyId)).toBe(true)
      expect(getAimAgent(legacyId).id).toBe(legacyId)
    }
  })

  it("旧 agentId 不做粗暴映射，仍走各自原 handler", () => {
    expect(getAgentHandler("content_producer").agentId).toBe("content_producer")
    expect(getAgentHandler("free_copywriter").agentId).toBe("free_copywriter")
    expect(getAgentHandler("deep_copywriter").agentId).toBe("deep_copywriter")
    expect(normalizeAimAgentId("deep_copywriter")).toBe("deep_copywriter")
  })

  it("generate 解析 writerModule 白名单，非法值按未传处理", () => {
    const base = { agentId: "copywriter", rawInput: "写一条口播", targetFormats: ["video_script"] }
    expect(parseGenerateBody({ ...base, writerModule: "social" }).writerModule).toBe("social")
    expect(parseGenerateBody({ ...base, writerModule: "longform" }).writerModule).toBe("longform")
    expect(parseGenerateBody({ ...base, writerModule: "free" }).writerModule).toBe("free")
    expect(parseGenerateBody({ ...base, writerModule: "auto" }).writerModule).toBe("auto")
    expect(parseGenerateBody({ ...base, writerModule: "garbage" }).writerModule).toBeUndefined()
    expect(validateGenerateInput({ ...parseGenerateBody(base), projectId: "p1" })).toBeNull()
  })
})
