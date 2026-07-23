import { describe, expect, it } from "vitest"

import {
  buildCanonicalContentSpec,
  buildCanonicalSourceView,
  confirmCanonicalContentSpec,
  getCanonicalFromTaskSpec,
  isCanonicalConfirmed,
  mapContentTaskToGoal,
  parseCanonicalContentSpec,
  reviseCanonicalContentSpec,
  withCanonicalOnTaskSpec,
  type CanonicalContentSpec,
} from "@/lib/canonical-content-spec"
import type { TaskSpec } from "@/lib/task-spec"

function baseTaskSpec(partial: Partial<TaskSpec> = {}): TaskSpec {
  return {
    goal: "把诊断做成可成交内容",
    mode: "direct_delivery",
    riskLevel: "medium",
    knownFacts: [],
    unknowns: [],
    assumptions: [],
    nextAction: "生成内容",
    classifiedBy: "rule",
    classifiedAt: "2026-07-23T00:00:00.000Z",
    ...partial,
  }
}

describe("canonical content mapping", () => {
  it("maps content tasks to content goals deterministically", () => {
    expect(mapContentTaskToGoal("吸引目标客户")).toBe("曝光")
    expect(mapContentTaskToGoal("建立专业信任")).toBe("信任")
    expect(mapContentTaskToGoal("推动咨询行动")).toBe("成交")
    expect(mapContentTaskToGoal("解释问题与方法")).toBe("获客")
    expect(mapContentTaskToGoal(undefined, "获客")).toBe("获客")
  })
})

describe("buildCanonicalContentSpec", () => {
  it("assembles draft mother content with knowledge ids and separates assumptions", () => {
    const spec = buildCanonicalContentSpec({
      taskSpec: baseTaskSpec({
        coreMessage: "老板要用真实案例建立信任",
        targetCustomer: "制造老板",
        realProblem: "不会持续产出内容",
        contentTask: "建立专业信任",
        desiredAction: "进一步咨询",
        exclusiveEvidence: "三年交付 40 个工厂案例",
        knownFacts: [{ statement: "服务离散制造", source: "项目-行业" }],
        unknowns: ["缺少可公开的成交数字"],
        assumptions: [{ statement: "客户更信过程证据", impact: "medium" }],
      }),
      mustKeepText: "第一人称经历",
      avoidText: "夸张承诺, 贬低同行",
      currentInput: "帮我写一条口播",
      knowledgeUsed: [
        { id: "k1", title: "工厂交付案例", category: "project_case" },
        { id: "k2", title: "本周热点", category: "hot_topic" },
      ],
    })

    expect(spec.schemaVersion).toBe(1)
    expect(spec.status).toBe("draft")
    expect(spec.version).toBe(0)
    expect(spec.coreMessage).toBe("老板要用真实案例建立信任")
    expect(spec.contentGoal).toBe("信任")
    expect(spec.mustKeep).toEqual(expect.arrayContaining(["第一人称经历", "三年交付 40 个工厂案例"]))
    expect(spec.avoid).toEqual(["夸张承诺", "贬低同行"])
    expect(spec.knowledgeUsed.map((item) => item.id)).toEqual(["k1", "k2"])
    expect(spec.evidence.some((item) => item.sourceId === "k1")).toBe(true)
    expect(spec.missingEvidence).toContain("缺少可公开的成交数字")
    expect(spec.modelAssumptions[0]?.statement).toContain("过程证据")
    expect(isCanonicalConfirmed(spec)).toBe(false)
  })

  it("does not invent evidence when facts are missing", () => {
    const spec = buildCanonicalContentSpec({
      taskSpec: baseTaskSpec({
        unknowns: ["没有真实案例"],
      }),
    })
    expect(spec.evidence.every((item) => item.statement.trim().length > 0)).toBe(true)
    expect(spec.missingEvidence).toContain("没有真实案例")
    expect(spec.coreMessage).toBe("把诊断做成可成交内容")
  })
})

describe("confirm and revise versions", () => {
  it("confirms draft as v1 and keeps history append-only", () => {
    const draft = buildCanonicalContentSpec({
      taskSpec: baseTaskSpec({ coreMessage: "先建立信任再成交" }),
    })
    const v1 = confirmCanonicalContentSpec(draft, "2026-07-23T10:00:00.000Z")
    expect(v1.status).toBe("confirmed")
    expect(v1.version).toBe(1)
    expect(v1.versionHistory).toHaveLength(1)
    expect(v1.versionHistory[0]?.coreMessage).toBe("先建立信任再成交")
    expect(isCanonicalConfirmed(v1)).toBe(true)

    const again = confirmCanonicalContentSpec(v1, "2026-07-23T11:00:00.000Z")
    expect(again.version).toBe(1)
    expect(again.versionHistory).toHaveLength(1)
  })

  it("creates a new version only when core facts change", () => {
    const v1 = confirmCanonicalContentSpec(
      buildCanonicalContentSpec({
        taskSpec: baseTaskSpec({
          coreMessage: "用案例证明交付能力",
          targetCustomer: "老板",
          realProblem: "没素材",
        }),
      }),
      "2026-07-23T10:00:00.000Z",
    )

    const wordingOnly = reviseCanonicalContentSpec(
      v1,
      {
        ...v1,
        personaAngle: "更口语一点",
        productBridge: "加微信领资料",
      },
      "2026-07-23T11:00:00.000Z",
    )
    expect(wordingOnly.version).toBe(1)
    expect(wordingOnly.personaAngle).toBe("更口语一点")
    expect(wordingOnly.versionHistory).toHaveLength(1)

    const factsChanged = reviseCanonicalContentSpec(
      v1,
      {
        ...v1,
        coreMessage: "先讲痛点再给方法",
      },
      "2026-07-23T12:00:00.000Z",
    )
    expect(factsChanged.version).toBe(2)
    expect(factsChanged.versionHistory).toHaveLength(2)
    expect(factsChanged.versionHistory[1]?.coreMessage).toBe("先讲痛点再给方法")
    expect(factsChanged.versionHistory[0]?.coreMessage).toBe("用案例证明交付能力")
  })
})

describe("source view and parse", () => {
  it("separates enterprise facts, dynamic materials and model assumptions", () => {
    const draft = buildCanonicalContentSpec({
      taskSpec: baseTaskSpec({
        coreMessage: "真实案例驱动获客",
        knownFacts: [{ statement: "服务离散制造", source: "项目-行业" }],
        assumptions: [{ statement: "用户会先看口播", impact: "low" }],
        unknowns: ["缺私域话术"],
      }),
      currentInput: "写朋友圈",
      knowledgeUsed: [
        { id: "k-case", title: "交付案例", category: "project_case" },
        { id: "k-hot", title: "热点话题", category: "hot_topic" },
      ],
    })
    const view = buildCanonicalSourceView(draft)
    expect(view.currentInput).toBe("写朋友圈")
    expect(view.enterpriseFacts.length).toBeGreaterThan(0)
    expect(view.dynamicMaterials.some((item) => item.sourceId === "k-hot")).toBe(true)
    expect(view.missingEvidence).toContain("缺私域话术")
    expect(view.modelAssumptions[0]?.statement).toContain("口播")
  })

  it("round-trips through taskSpec.canonical JSON", () => {
    const confirmed = confirmCanonicalContentSpec(
      buildCanonicalContentSpec({
        taskSpec: baseTaskSpec({ coreMessage: "可追溯母内容" }),
        knowledgeUsed: [{ id: "k1", title: "案例", category: "project_case" }],
      }),
    )
    const taskSpec = withCanonicalOnTaskSpec(baseTaskSpec(), confirmed)
    const parsed = getCanonicalFromTaskSpec(taskSpec)
    expect(parsed?.coreMessage).toBe("可追溯母内容")
    expect(parsed?.knowledgeUsed[0]?.id).toBe("k1")
    expect(parseCanonicalContentSpec({ schemaVersion: 2, coreMessage: "x" })).toBeNull()
    expect(parseCanonicalContentSpec({ schemaVersion: 1 })).toBeNull()
  })

  it("is deterministic across repeated builds", () => {
    const input = {
      taskSpec: baseTaskSpec({
        coreMessage: "稳定输出",
        knownFacts: [{ statement: "事实A", source: "知识库" }],
      }),
      knowledgeUsed: [{ id: "k1", title: "A", category: "product_usp" }],
    }
    const a = buildCanonicalContentSpec(input)
    const b = buildCanonicalContentSpec(input)
    expect(a).toEqual(b)
  })
})
