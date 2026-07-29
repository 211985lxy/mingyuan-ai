import { describe, expect, it } from "vitest"
import {
  ASSET_CANDIDATE_KINDS,
  ASSET_CANDIDATE_KIND_LABELS,
  buildAssetCandidatesFromInsight,
} from "@/lib/aim/asset-candidates"
import { extractMeetingInsight, type MeetingInsight } from "@/lib/aim/meeting-insight"

// 会后资产候选构建器（90 天计划 3.1）纯域层测试。
// 原则：只从结构化洞察确定性映射，禁止伪造原文证据；
// 没有来源数据的资产类型直接缺省，不凑数。

function makeInsight(
  overrides: Partial<Parameters<typeof extractMeetingInsight>[0]> = {},
): MeetingInsight {
  const result = extractMeetingInsight({
    meetingTitle: "数字供暖项目启动会",
    customer: "葛老板",
    pains: [],
    goals: ["提升线上获客"],
    budgets: [],
    decisionStage: "",
    objections: [],
    followUps: [],
    diagnosisQuestions: [],
    topicCandidates: [],
    deliveryTasks: [{ title: "输出诊断方案" }],
    ...overrides,
  })
  if (!result.ok) throw new Error(result.error)
  return result.insight
}

describe("buildAssetCandidatesFromInsight", () => {
  it("八类资产类型均有中文标签", () => {
    expect(ASSET_CANDIDATE_KINDS).toHaveLength(8)
    for (const kind of ASSET_CANDIDATE_KINDS) {
      expect(ASSET_CANDIDATE_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  it("痛点逐条生成 pain_point 候选，evidence 必须是会议原文", () => {
    const insight = makeInsight({ pains: ["冬天室温上不去", "老客户流失严重"] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "pain_point")
    expect(drafts).toHaveLength(2)
    expect(drafts[0].evidence).toBe("冬天室温上不去")
    expect(drafts[0].confidence).toBe("high")
  })

  it("异议逐条生成 objection 候选", () => {
    const insight = makeInsight({ objections: ["担心效果看不见", "觉得价格偏高"] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "objection")
    expect(drafts).toHaveLength(2)
    expect(drafts[1].evidence).toBe("觉得价格偏高")
    expect(drafts[1].confidence).toBe("high")
  })

  it("痛点与异议同时生成 customer_quote（客户原话），跨来源去重", () => {
    const insight = makeInsight({
      pains: ["冬天室温上不去"],
      objections: ["冬天室温上不去", "担心没效果"],
    })
    const quotes = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "customer_quote")
    // 「冬天室温上不去」在痛点与异议中重复，只保留一条原话
    expect(quotes).toHaveLength(2)
    expect(quotes.map((q) => q.evidence)).toEqual(["冬天室温上不去", "担心没效果"])
  })

  it("跟进建议生成 follow_up_script 候选（置信度 medium）", () => {
    const insight = makeInsight({ followUps: ["下周发诊断报告后约二面"] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "follow_up_script")
    expect(drafts).toHaveLength(1)
    expect(drafts[0].confidence).toBe("medium")
  })

  it("选题候选生成 content_topic（置信度 medium）", () => {
    const insight = makeInsight({ topicCandidates: ["数字供暖为什么省电"] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "content_topic")
    expect(drafts).toHaveLength(1)
    expect(drafts[0].evidence).toBe("数字供暖为什么省电")
  })

  it("决策后期（方案比较/决策中）客户目标生成 deal_trigger，已成交置信度 high", () => {
    const comparing = makeInsight({ decisionStage: "方案比较", goals: ["三个月内获客翻倍"] })
    const comparingDrafts = buildAssetCandidatesFromInsight(comparing).filter((d) => d.kind === "deal_trigger")
    expect(comparingDrafts).toHaveLength(1)
    expect(comparingDrafts[0].confidence).toBe("medium")

    const won = makeInsight({ decisionStage: "已成交", goals: ["三个月内获客翻倍"] })
    const wonDrafts = buildAssetCandidatesFromInsight(won).filter((d) => d.kind === "deal_trigger")
    expect(wonDrafts[0].confidence).toBe("high")
  })

  it("初步接触阶段不生成 deal_trigger", () => {
    const insight = makeInsight({ decisionStage: "初步接触", goals: ["了解一下"] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "deal_trigger")
    expect(drafts).toHaveLength(0)
  })

  it("已成交且有交付任务时生成且仅生成一条 case_candidate", () => {
    const insight = makeInsight({
      decisionStage: "已成交",
      deliveryTasks: [{ title: "输出诊断方案" }, { title: "搭建内容体系" }],
    })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "case_candidate")
    expect(drafts).toHaveLength(1)
    expect(drafts[0].confidence).toBe("low")
    expect(drafts[0].content).toContain("葛老板")
    expect(drafts[0].title).toContain("转化案例候选")
    expect(drafts[0].title).not.toContain("成功案例")
  })

  it("未成交不生成 case_candidate（禁止虚构案例）", () => {
    const insight = makeInsight({ decisionStage: "决策中" })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "case_candidate")
    expect(drafts).toHaveLength(0)
  })

  it("诊断问题生成 methodology_revision 候选（置信度 low）", () => {
    const insight = makeInsight({ diagnosisQuestions: ["目前获客主要靠什么渠道？"] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter(
      (d) => d.kind === "methodology_revision",
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0].confidence).toBe("low")
  })

  it("没有任何来源数据时返回空数组，不伪造资产", () => {
    const insight = makeInsight({ goals: ["只有一个目标"] })
    // 只有目标、初步接触、无其他字段：不应产生候选
    const early = makeInsight({ goals: [], deliveryTasks: [{ title: "仅任务" }] })
    expect(buildAssetCandidatesFromInsight(early)).toEqual([])
    void insight
  })

  it("所有候选默认 crossProjectAllowed=false（跨项目复用需人工批准）", () => {
    const insight = makeInsight({
      pains: ["痛点"],
      objections: ["异议"],
      followUps: ["跟进"],
      topicCandidates: ["选题"],
      diagnosisQuestions: ["问题"],
      decisionStage: "已成交",
    })
    for (const draft of buildAssetCandidatesFromInsight(insight)) {
      expect(draft.crossProjectAllowed).toBe(false)
    }
  })

  it("标题截断到 60 字以内", () => {
    const longPain = "痛".repeat(200)
    const insight = makeInsight({ pains: [longPain] })
    const drafts = buildAssetCandidatesFromInsight(insight).filter((d) => d.kind === "pain_point")
    expect(drafts[0].title.length).toBeLessThanOrEqual(60)
  })
})
