/**
 * 销售诊断补证路径的信息不足 / 证据缺口 fixture（正本：各 ≥3）。
 * 不调用模型；供 Tool Loop 与单测断言「缺口时转人工」。
 */

export type SalesSupplementFixtureKind = "success" | "insufficient" | "tool_failed"

export interface SalesSupplementFixture {
  id: string
  kind: SalesSupplementFixtureKind
  transcript: string
  claimedFacts: string[]
  /** 已从只读工具拿到的证据摘录 */
  toolEvidence: string[]
  expectHumanHandoff: boolean
  expectInsufficientWarning: boolean
}

export const SALES_SUPPLEMENT_FIXTURES: readonly SalesSupplementFixture[] = Object.freeze([
  {
    id: "sales_supp_success_budget",
    kind: "success",
    transcript: "客户王总说预算大概在三十万，下周可以确认合同条款。",
    claimedFacts: ["预算大概在三十万"],
    toolEvidence: ["预算大概在三十万"],
    expectHumanHandoff: false,
    expectInsufficientWarning: false,
  },
  {
    id: "sales_supp_success_timeline",
    kind: "success",
    transcript: "张经理确认下个月十五号前完成方案评审。",
    claimedFacts: ["下个月十五号前完成方案评审"],
    toolEvidence: ["下个月十五号前完成方案评审"],
    expectHumanHandoff: false,
    expectInsufficientWarning: false,
  },
  {
    id: "sales_supp_success_competitor",
    kind: "success",
    transcript: "会上提到竞品报价是二十八万，我方需要压到二十六万以内。",
    claimedFacts: ["竞品报价是二十八万"],
    toolEvidence: ["竞品报价是二十八万"],
    expectHumanHandoff: false,
    expectInsufficientWarning: false,
  },
  {
    id: "sales_supp_insufficient_owner",
    kind: "insufficient",
    transcript: "对方表示有兴趣，但没说谁负责拍板。",
    claimedFacts: ["李经理负责拍板"],
    toolEvidence: [],
    expectHumanHandoff: true,
    expectInsufficientWarning: true,
  },
  {
    id: "sales_supp_insufficient_budget",
    kind: "insufficient",
    transcript: "客户只说预算还在评估，没有给出数字。",
    claimedFacts: ["预算五十万"],
    toolEvidence: [],
    expectHumanHandoff: true,
    expectInsufficientWarning: true,
  },
  {
    id: "sales_supp_insufficient_commitment",
    kind: "insufficient",
    transcript: "对方礼貌表示回去商量，没有明确签约时间。",
    claimedFacts: ["下周签约"],
    toolEvidence: ["回去商量"],
    expectHumanHandoff: true,
    expectInsufficientWarning: true,
  },
  {
    id: "sales_supp_tool_failed_knowledge",
    kind: "tool_failed",
    transcript: "会议提到竞品报价，细节在知识库。",
    claimedFacts: ["竞品报价低于我方"],
    toolEvidence: [],
    expectHumanHandoff: true,
    expectInsufficientWarning: true,
  },
  {
    id: "sales_supp_tool_failed_timeout",
    kind: "tool_failed",
    transcript: "客户提到历史合同条款，需要检索项目记忆。",
    claimedFacts: ["历史合同含独家条款"],
    toolEvidence: [],
    expectHumanHandoff: true,
    expectInsufficientWarning: true,
  },
  {
    id: "sales_supp_tool_failed_unauthorized",
    kind: "tool_failed",
    transcript: "提到跨项目案例可参考，但工具拒绝跨项目读取。",
    claimedFacts: ["A 项目案例可直接复用"],
    toolEvidence: [],
    expectHumanHandoff: true,
    expectInsufficientWarning: true,
  },
])

function normalize(value: string): string {
  return value.replace(/\s+/g, "")
}

/**
 * @description 判断声称事实是否被工具证据或原文覆盖；否则信息不足
 */
export function assessSalesSupplementEvidence(fixture: SalesSupplementFixture): {
  covered: string[]
  missing: string[]
  insufficient: boolean
  humanRequired: boolean
} {
  const corpus = normalize([fixture.transcript, ...fixture.toolEvidence].join("\n"))
  const covered: string[] = []
  const missing: string[] = []
  for (const fact of fixture.claimedFacts) {
    if (
      corpus.includes(normalize(fact)) ||
      fixture.toolEvidence.some((e) => normalize(e).includes(normalize(fact)))
    ) {
      covered.push(fact)
    } else {
      missing.push(fact)
    }
  }
  const insufficient = missing.length > 0
  return {
    covered,
    missing,
    insufficient,
    humanRequired: insufficient || fixture.kind === "tool_failed",
  }
}
