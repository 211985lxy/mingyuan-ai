import { describe, it, expect } from "vitest"
import {
  buildTaskSpecSkeleton,
  RISK_KEYWORDS_HIGH,
  inferRiskLevel,
  inferMode,
  getTaskSpecCopyStudioModule,
  sanitizeLLMRefinement,
  type TaskSpecInput,
  withCopyStudioExecution,
} from "@/lib/task-spec"
import { refineTaskSpec, type LLMRefineClient } from "@/lib/task-spec-llm"

const baseInput: TaskSpecInput = {
  agentId: "content_producer",
  taskType: "write_script",
  rawInput: "围绕企业咨询的客户分层讲一条",
  project: {
    name: "测试项目",
    targetCustomer: "中小企业老板",
    industry: "企业咨询",
    offer: "管理咨询服务",
    deliveryGoal: "先诊断后成交",
  },
  topicSelection: null,
  knowledgeTitles: [],
}

describe("inferRiskLevel", () => {
  it("polish_copy/repurpose/free_copywriter 为低风险", () => {
    expect(inferRiskLevel({ ...baseInput, taskType: "polish_copy", agentId: "content_producer" })).toBe("low")
    expect(inferRiskLevel({ ...baseInput, taskType: "repurpose", agentId: "free_copywriter" })).toBe("low")
  })
  it("business_diagnosis 为高风险，内容创作为中风险", () => {
    expect(inferRiskLevel({ ...baseInput, agentId: "business_diagnosis" })).toBe("high")
    expect(inferRiskLevel({ ...baseInput, agentId: "content_producer" })).toBe("medium")
  })
  it("含高风险关键词(商业诊断/IP定位/成交路径)为高风险", () => {
    expect(inferRiskLevel({ ...baseInput, agentId: "content_producer", rawInput: "帮我做商业诊断" })).toBe("high")
  })
  it("write_script 默认中风险", () => {
    expect(inferRiskLevel({ ...baseInput })).toBe("medium")
  })
})

describe("inferMode", () => {
  it("低风险 -> direct_delivery", () => {
    expect(inferMode("low", false)).toBe("direct_delivery")
  })
  it("中风险 -> assumption_delivery", () => {
    expect(inferMode("medium", false)).toBe("assumption_delivery")
  })
  it("高风险 + 资料完整 -> assumption_delivery", () => {
    expect(inferMode("high", true)).toBe("assumption_delivery")
  })
  it("高风险 + 资料缺失 -> discovery_exploration", () => {
    expect(inferMode("high", false)).toBe("discovery_exploration")
  })
  it("永不主动返回 feedback_iteration（属 Sprint3）", () => {
    for (const risk of ["low", "medium", "high"] as const) {
      for (const complete of [true, false]) {
        expect(inferMode(risk, complete)).not.toBe("feedback_iteration")
      }
    }
  })
})

describe("buildTaskSpecSkeleton", () => {
  it("knownFacts 只来自真实上下文，不臆造", () => {
    const spec = buildTaskSpecSkeleton(baseInput)
    const allKnown = spec.knownFacts.map((f) => f.statement).join("|")
    expect(allKnown).toContain("中小企业老板")
    expect(spec.knownFacts.every((f) => f.source)).toBe(true)
    expect(allKnown).not.toMatch(/\d+%/)
  })
  it("项目资料缺失时 targetCustomer 为 undefined（非空字符串）", () => {
    const spec = buildTaskSpecSkeleton({ ...baseInput, project: null })
    expect(spec.targetCustomer).toBeUndefined()
  })
  it("高风险+资料缺失 -> discovery_exploration + unknowns 非空", () => {
    const spec = buildTaskSpecSkeleton({ ...baseInput, agentId: "business_diagnosis", project: null })
    expect(spec.mode).toBe("discovery_exploration")
    expect(spec.unknowns.length).toBeGreaterThan(0)
  })
  it("classifiedBy 标记为 rule", () => {
    expect(buildTaskSpecSkeleton(baseInput).classifiedBy).toBe("rule")
  })
})

describe("task spec execution metadata", () => {
  it("persists a copy-studio module without changing cognitive task fields", () => {
    const spec = buildTaskSpecSkeleton(baseInput)
    const withExecution = withCopyStudioExecution(spec, "social")
    expect(withExecution?.goal).toBe(spec.goal)
    expect(withExecution?.knownFacts).toEqual(spec.knownFacts)
    expect(getTaskSpecCopyStudioModule(withExecution)).toBe("social")
    expect(getTaskSpecCopyStudioModule(spec)).toBeUndefined()
  })
})

describe("sanitizeLLMRefinement", () => {
  it("丢弃 LLM 试图塞入的 knownFacts（铁律）", () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    const cleaned = sanitizeLLMRefinement(skeleton, {
      mode: "assumption_delivery",
      unknowns: ["客户当前客单价区间"],
      assumptions: [{ statement: "客户主推 30-100 万项目", impact: "medium" }],
      knownFacts: [{ statement: "编造：客户年营收 5000 万" }],
    })
    expect(cleaned.knownFacts.find((f) => f.statement.includes("5000 万"))).toBeUndefined()
    expect(cleaned.classifiedBy).toBe("llm")
    expect(cleaned.unknowns).toContain("客户当前客单价区间")
  })
  it("LLM mode 超出规则候选范围则忽略，保持骨架 mode", () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    const cleaned = sanitizeLLMRefinement(skeleton, { mode: "feedback_iteration" })
    expect(cleaned.mode).toBe(skeleton.mode)
  })
})

describe("refineTaskSpec 降级行为", () => {
  it("LLM 失败时退回骨架并标记 rule_fallback，任务不中断", async () => {
    const failingClient: LLMRefineClient = { complete: async () => { throw new Error("LLM down") } }
    const skeleton = buildTaskSpecSkeleton({ ...baseInput, agentId: "business_diagnosis" })
    const result = await refineTaskSpec(skeleton, { client: failingClient, enabled: true })
    expect(result.classifiedBy).toBe("rule_fallback")
    expect(result.mode).toBe(skeleton.mode)
  })
  it("enabled=false 时直接返回骨架(classifiedBy=rule)", async () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    const result = await refineTaskSpec(skeleton, { enabled: false })
    expect(result.classifiedBy).toBe("rule")
  })
  it("低风险任务不调用 LLM", async () => {
    let called = false
    const client: LLMRefineClient = { complete: async () => { called = true; return "{}" } }
    const skeleton = buildTaskSpecSkeleton({ ...baseInput, taskType: "polish_copy" })
    await refineTaskSpec(skeleton, { client, enabled: true })
    expect(called).toBe(false)
  })
  it("LLM 返回合法 JSON 时合并并标记 llm", async () => {
    const client: LLMRefineClient = {
      complete: async () => JSON.stringify({ mode: "discovery_exploration", unknowns: ["客户客单价区间"], assumptions: [{ statement: "主推中大型项目", impact: "high" }] }),
    }
    const skeleton = buildTaskSpecSkeleton({ ...baseInput, agentId: "business_diagnosis", project: null })
    const result = await refineTaskSpec(skeleton, { client, enabled: true })
    expect(result.classifiedBy).toBe("llm")
    expect(result.unknowns).toContain("客户客单价区间")
  })
})
