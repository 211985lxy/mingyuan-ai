import { describe, it, expect } from "vitest"
import {
  buildTaskSpecSkeleton,
  enrichTaskSpecFromRawInput,
  isTaskSpecLike,
  RISK_KEYWORDS_HIGH,
  inferRiskLevel,
  inferMode,
  getTaskSpecCopyStudioModule,
  sanitizeLLMRefinement,
  type TaskSpecInput,
  type TaskSpec,
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


// 2026-09-09 生产事故回归：execute-attempt 建行时把 {"execution":{...}} 写进 taskSpec 列，
// 该标记被当作 TaskSpec 采纳后 [...spec.unknowns] 抛 "unknowns is not iterable"，
// 统一入口交付全量失败（~300ms 确定性崩溃、零模型调用）。
describe("isTaskSpecLike / 存量 taskSpec 采纳守卫", () => {
  it("拒绝执行状态标记与非对象", () => {
    expect(isTaskSpecLike({ execution: { phase: "running", source: "execute" } })).toBe(false)
    expect(isTaskSpecLike(null)).toBe(false)
    expect(isTaskSpecLike([])).toBe(false)
    expect(isTaskSpecLike("text")).toBe(false)
    expect(isTaskSpecLike(undefined)).toBe(false)
  })

  it("接受带核心字段的真 TaskSpec（含缺 unknowns 的旧版结构）", () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    expect(isTaskSpecLike(skeleton)).toBe(true)
    // 旧版存量行可能缺 unknowns，但有 goal 等核心字段——应可采纳
    expect(isTaskSpecLike({ goal: "获客", knownFacts: [] })).toBe(true)
    expect(isTaskSpecLike({ assumptions: [] })).toBe(true)
  })
})

describe("enrichTaskSpecFromRawInput 容错", () => {
  it("spec 缺 unknowns/assumptions 时不抛错并补齐数组", () => {
    const malformed = { goal: "获客" } as unknown as TaskSpec
    const enriched = enrichTaskSpecFromRawInput(malformed, "写一条口播文案，痛点是获客难", {
      outputFormatHint: "口播脚本",
    })
    expect(Array.isArray(enriched.unknowns)).toBe(true)
    expect(Array.isArray(enriched.assumptions)).toBe(true)
    expect(enriched.outputFormat).toBe("口播脚本")
  })
})
