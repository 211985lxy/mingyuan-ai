import { describe, expect, it } from "vitest"
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import { verifySalesDiagnosis } from "@/lib/aim/sales-diagnosis/verifier"

const TRANSCRIPT = [
  "客户目前处于需求确认阶段。",
  "客户目标是年底前把转化率提升到5%。",
  "客户表示年度预算是30万元。",
  "张伟负责提供数据清单。",
  "客户承诺下周确认试点范围。",
].join("\n")

function insight(overrides: Partial<MeetingInsight> = {}): MeetingInsight {
  return {
    meetingTitle: "销售诊断会",
    customer: "匿名客户",
    pains: ["转化率低"],
    goals: ["年底前把转化率提升到5%"],
    budgets: ["年度预算是30万元"],
    decisionStage: "需求确认",
    decisionStageRaw: "需求确认",
    decisionStageUnresolved: false,
    objections: [],
    followUps: ["发送试点方案"],
    diagnosisQuestions: [],
    topicCandidates: [],
    deliveryTasks: [{ title: "提供数据清单", owner: "张伟" }],
    budgetFigures: [300000],
    budgetSpecified: true,
    evidence: [
      { kind: "goal", statement: "目标及决策阶段", quote: "客户目前处于需求确认阶段。客户目标是年底前把转化率提升到5%。" },
      { kind: "budget", statement: "年度预算是30万元", quote: "客户表示年度预算是30万元。" },
      { kind: "task", statement: "张伟负责提供数据清单", quote: "张伟负责提供数据清单。" },
      { kind: "commitment", statement: "客户承诺下周确认试点范围", quote: "客户承诺下周确认试点范围。" },
    ],
    ...overrides,
  }
}

function input(overrides: Partial<Parameters<typeof verifySalesDiagnosis>[0]> = {}) {
  return {
    projectId: "project_1",
    customer: "匿名客户",
    meetingTitle: "销售诊断会",
    transcript: TRANSCRIPT,
    insight: insight(),
    ...overrides,
  }
}

describe("verifySalesDiagnosis", () => {
  it("完整且可追溯的销售诊断通过，但下一步仍是人工审核", () => {
    const result = verifySalesDiagnosis(input())
    expect(result.status).toBe("pass")
    expect(result.nextAction).toBe("进入人工审核")
    expect(result.checks.every((check) => check.passed)).toBe(true)
  })

  it("只允许空白差异，不允许模型改写 quote", () => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        evidence: [{ kind: "goal", statement: "目标", quote: "客户目标是年底前把转化率提升到 5%。" }],
        budgets: [],
        budgetFigures: [],
        budgetSpecified: false,
        decisionStage: "",
        decisionStageRaw: "",
        deliveryTasks: [{ title: "发送方案" }],
      }),
    }))
    expect(result.status).toBe("pass")
  })

  it("信息不足但没有高风险事实时进入 needs_human", () => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        budgets: [],
        budgetFigures: [],
        budgetSpecified: false,
        decisionStage: "",
        decisionStageRaw: "",
        deliveryTasks: [],
        evidence: [],
      }),
    }))
    expect(result.status).toBe("needs_human")
    expect(result.nextAction).toBe("进入人工审核")
  })

  it.each([
    ["预算", { budgets: ["预算500万元"], budgetFigures: [5000000], budgetSpecified: true }],
    ["负责人", { deliveryTasks: [{ title: "提供数据清单", owner: "李某" }] }],
    ["决策阶段", { decisionStage: "方案比较", decisionStageRaw: "方案比较" }],
  ])("阻断无原文依据的%s判断", (_label, overrides) => {
    const result = verifySalesDiagnosis(input({ insight: insight(overrides as Partial<MeetingInsight>) }))
    expect(result.status).toBe("fail")
    expect(result.nextAction).toContain("人工接管")
  })

  it.each([
    ["预算", { budgets: ["预算5000万"], budgetFigures: [50000000], budgetSpecified: true }, { kind: "budget", statement: "预算5000万", quote: "客户目标是年底前把转化率提升到5%。" }],
    ["负责人", { deliveryTasks: [{ title: "提供数据清单", owner: "李某" }] }, { kind: "task", statement: "李某负责提供数据清单", quote: "客户目标是年底前把转化率提升到5%。" }],
    ["决策阶段", { decisionStage: "方案比较", decisionStageRaw: "方案比较" }, { kind: "goal", statement: "决策阶段是方案比较", quote: "客户目标是年底前把转化率提升到5%。" }],
    ["客户承诺", { followUps: ["客户承诺明天签约"] }, { kind: "commitment", statement: "客户承诺明天签约", quote: "客户承诺下周确认试点范围。" }],
  ])("真实但无关的 quote 不能支撑虚构的%s statement", (_label, overrides, falseEvidence) => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        ...(overrides as Partial<MeetingInsight>),
        evidence: [
          ...(insight().evidence ?? []).filter((item) => item.kind !== falseEvidence.kind),
          falseEvidence as NonNullable<MeetingInsight["evidence"]>[number],
        ],
      }),
    }))
    expect(result.status).toBe("fail")
  })

  it("未知决策阶段没有原文证据时失败，有证据时仍需人工收敛枚举", () => {
    const noEvidence = verifySalesDiagnosis(input({
      insight: insight({
        decisionStage: "",
        decisionStageRaw: "马上签约",
        decisionStageUnresolved: true,
        evidence: (insight().evidence ?? []).filter((item) => item.kind !== "goal"),
      }),
    }))
    expect(noEvidence.status).toBe("fail")

    const withEvidence = verifySalesDiagnosis(input({
      transcript: `${TRANSCRIPT}\n客户说目前马上签约。`,
      insight: insight({
        decisionStage: "",
        decisionStageRaw: "马上签约",
        decisionStageUnresolved: true,
        evidence: [
          ...(insight().evidence ?? []).filter((item) => item.kind !== "goal"),
          { kind: "goal", statement: "未知决策阶段", quote: "客户说目前马上签约。" },
        ],
      }),
    }))
    expect(withEvidence.status).toBe("needs_human")
  })

  it("quote 仅归一化空白，不忽略英文字母大小写", () => {
    const result = verifySalesDiagnosis(input({
      transcript: `${TRANSCRIPT}\n项目代号是 Project Alpha。`,
      insight: insight({
        evidence: [
          ...(insight().evidence ?? []),
          { kind: "pain", statement: "项目代号", quote: "项目代号是 project Alpha。" },
        ],
      }),
    }))
    expect(result.status).toBe("fail")
  })

  it("阻断模型虚构的客户承诺 quote", () => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        evidence: [
          ...(insight().evidence ?? []).filter((item) => item.kind !== "commitment"),
          { kind: "commitment", statement: "客户明天签约", quote: "客户明天签约。" },
        ],
      }),
    }))
    expect(result.status).toBe("fail")
  })

  it("阻断藏在 followUps 中但没有证据的客户承诺", () => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        followUps: ["客户承诺明天签约"],
        evidence: (insight().evidence ?? []).filter((item) => item.kind !== "commitment"),
      }),
    }))
    expect(result.status).toBe("fail")
  })

  it.each(["客户会在周五付款", "客户确定下周提供名单"])("识别常见客户未来动作：%s", (followUp) => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        followUps: [followUp],
        evidence: (insight().evidence ?? []).filter((item) => item.kind !== "commitment"),
      }),
    }))
    expect(result.status).toBe("fail")
  })

  it("承诺 statement 不能借用另一条真实承诺 quote", () => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        followUps: ["顾问建议下周发送报价"],
        evidence: [
          ...(insight().evidence ?? []).filter((item) => item.kind !== "commitment"),
          { kind: "commitment", statement: "客户明天签约", quote: "客户承诺下周确认试点范围。" },
        ],
      }),
    }))
    expect(result.status).toBe("fail")
  })

  it("跟进建议不会被当成客户承诺", () => {
    const result = verifySalesDiagnosis(input({
      insight: insight({
        followUps: ["顾问建议下周发送报价"],
        evidence: (insight().evidence ?? []).filter((item) => item.kind !== "commitment"),
      }),
    }))
    expect(result.status).toBe("pass")
  })

  it("结构损坏或缺项目立即失败", () => {
    expect(verifySalesDiagnosis(input({ projectId: "" })).status).toBe("fail")
    expect(verifySalesDiagnosis(input({ transcript: "" })).status).toBe("fail")
  })
})
