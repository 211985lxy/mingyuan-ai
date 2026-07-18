import { describe, expect, it } from "vitest"
import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import { getAgentHandler } from "@/lib/aim-agent-handlers"
import { isValidAimAgent, normalizeAimAgentId, DEFAULT_AIM_AGENT } from "@/lib/aim-ui-config"

describe("agentId 入口校验与归一化", () => {
  it("合法 agentId 原样通过解析与校验", () => {
    const parsed = parseGenerateBody({
      agentId: "business_diagnosis",
      rawInput: "帮我做账号定位",
      targetFormats: ["raw_copy"],
    })

    expect(parsed.agentId).toBe("business_diagnosis")
    expect(validateGenerateInput({ ...parsed, projectId: "p1" })).toBeNull()
  })

  it("旧别名 ip_video 在解析时归一化为 content_producer", () => {
    const parsed = parseGenerateBody({
      agentId: "ip_video",
      rawInput: "写一条短视频口播",
      targetFormats: ["video_script"],
    })

    expect(parsed.agentId).toBe("content_producer")
    expect(validateGenerateInput({ ...parsed, projectId: "p1" })).toBeNull()
  })

  it("非法 agentId 在解析时原样保留，并被校验拒绝", () => {
    const parsed = parseGenerateBody({
      agentId: "not_a_real_agent",
      rawInput: "写一条短视频口播",
      targetFormats: ["video_script"],
    })

    expect(parsed.agentId).toBe("not_a_real_agent")
    expect(validateGenerateInput({ ...parsed, projectId: "p1" })).toBe("不支持的内容智能体")
  })

  it("空 agentId 解析为 undefined（走默认智能体），校验放行", () => {
    const parsed = parseGenerateBody({
      rawInput: "写一条短视频口播",
      targetFormats: ["video_script"],
    })

    expect(parsed.agentId).toBeUndefined()
    expect(validateGenerateInput({ ...parsed, projectId: "p1" })).toBeNull()
  })

  it("getAgentHandler 对旧别名返回 content_producer handler", () => {
    expect(getAgentHandler("ip_video").agentId).toBe("content_producer")
  })

  it("getAgentHandler 对未知 id 兜底默认 handler", () => {
    // 兜底应与 DEFAULT_AIM_AGENT（当前 copywriter）单一事实源一致，
    // 而非硬编码 content_producer，避免默认智能体切换后再次漂移。
    expect(getAgentHandler("garbage").agentId).toBe(DEFAULT_AIM_AGENT)
  })

  it("normalizeAimAgentId / isValidAimAgent 单一事实源行为一致", () => {
    expect(normalizeAimAgentId("ip_video")).toBe("content_producer")
    expect(normalizeAimAgentId("persona")).toBe("persona")
    expect(isValidAimAgent("ip_video")).toBe(true)
    expect(isValidAimAgent("not_a_real_agent")).toBe(false)
  })
})
