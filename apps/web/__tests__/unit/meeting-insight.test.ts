import { describe, expect, it } from "vitest"

import {
  buildWorkItemReviewFields,
  extractMeetingInsight,
  MEETING_DECISION_STAGES,
  type MeetingInsightInput,
} from "@/lib/aim/meeting-insight"

// WP-6 客户会后工作流 · 纯域层会议洞察抽取器。
// 不依赖 UI / DB / 飞书 / LLM。验收样本来自两份真实纪要（脱敏片段）：
//  - 中汝达数字供暖（葛老板）融资/落地咨询
//  - 领袖中国（袁总）AI 智能体定制合作
// 对照 docs/plans/aim-ai-native-company-zcode-execution-plan.md §9 阶段 B 九类产出。

/** 中汝达样本（脱敏精简）——验证融资/落地类会议的洞察抽取。 */
const ZHONGRUDA_INPUT: MeetingInsightInput = {
  meetingTitle: "中汝达数字供暖 · 融资与落地咨询",
  customer: "中汝达数字供暖（葛老板）",
  pains: [
    "无技术壁垒，新技术下场易被替代",
    "缺权威背书，专业性不够硬科技",
    "公司主体在甘肃，杭州融资要求先迁总部",
  ],
  goals: ["今年营收冲 3000 万", "完成种子轮融资 1500 万", "杭州注册新主体用于融资上市"],
  budgets: ["种子轮上限 1500 万（估值 1.5 亿×10%）", "融资目标 2000 万，自出 10-20%"],
  decisionStage: "需求确认",
  objections: [
    "顾问认为现在招投融资专人太早，先路演 5 轮再决定",
    "融资 3000 万估值撑不住，释放股权过大",
  ],
  followUps: [
    "先走银行贷款（利率约 3.05%），不等股权融资",
    "葛老板先自己路演 5 轮感受市场反馈",
    "8 月从甘肃回杭州后当面推进迁总部",
  ],
  diagnosisQuestions: [
    "估值口径以 1.5 亿还是 3 亿对外？",
    "杭州落地的税收返还/场地要求具体多少？",
  ],
  topicCandidates: [
    "智慧供暖如何做到省电 30%+（电价联动 + 气候补偿）",
    "2027 燃煤锅炉强制退出，整县供热改造的机会窗口",
  ],
  deliveryTasks: [
    { title: "制作融资 PPT（资方/政府/合伙人/内部四套话术）", owner: "葛老板" },
    { title: "杭州注册新主体（名称 + 股权架构）", owner: "葛老板" },
  ],
}

/** 袁总样本（脱敏精简）——验证 AI 智能体定制类会议，含未知决策阶段与缺失预算。 */
const YUANZONG_INPUT: MeetingInsightInput = {
  meetingTitle: "领袖中国 · AI 智能体定制合作",
  customer: "领袖中国（袁总）",
  pains: [
    "20 多年案例资产几乎全在员工脑子里，数据化程度极差",
    "钟国凌精力分散，扛老业务+新媒体+AI 三条线，无法全情投入 AI",
  ],
  goals: ["定制策略文案智能体 + 设计智能体，从新媒体切入", "建立袁总对 AI 底层逻辑的认知"],
  budgets: [], // 该会议预算未定，验证"不强造预算"
  decisionStage: "正在比价中", // 未知枚举值，验证 raw 保留 + unresolved
  objections: ["袁总在做多方比价，先出牌容易沦为价格参考（炮灰）"],
  followUps: [
    "钟国凌对接 3 家供应商，帮袁总形成价格锚点",
    "我方出《袁总未来合作规划方案》v1 + 备选方案",
  ],
  diagnosisQuestions: ["袁总心理锚点是否已形成（钟国凌反馈）？"],
  topicCandidates: ["20 年战略定位方法论如何沉淀成策划智能体的语料"],
  deliveryTasks: [{ title: "出袁总合作规划方案 v1", owner: "我方" }],
}

describe("extractMeetingInsight — 中汝达样本", () => {
  const result = extractMeetingInsight(ZHONGRUDA_INPUT)

  it("成功抽取，ok:true", () => {
    expect(result.ok).toBe(true)
  })

  it("保留会议标题与客户", () => {
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.meetingTitle).toContain("中汝达")
    expect(result.insight.customer).toContain("葛老板")
  })

  it("九类产出齐全：痛点/目标/预算/异议/跟进/诊断/选题/交付", () => {
    if (!result.ok) throw new Error("expected ok")
    const i = result.insight
    expect(i.pains.length).toBeGreaterThanOrEqual(3)
    expect(i.goals.length).toBeGreaterThanOrEqual(1)
    expect(i.budgets.length).toBeGreaterThanOrEqual(1)
    expect(i.objections.length).toBeGreaterThanOrEqual(1)
    expect(i.followUps.length).toBeGreaterThanOrEqual(1)
    expect(i.diagnosisQuestions.length).toBeGreaterThanOrEqual(1)
    expect(i.topicCandidates.length).toBeGreaterThanOrEqual(1)
    expect(i.deliveryTasks.length).toBeGreaterThanOrEqual(1)
  })

  it("决策阶段落入合法枚举", () => {
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.decisionStage).toBe("需求确认")
    expect(result.insight.decisionStageUnresolved).toBe(false)
  })
})

describe("extractMeetingInsight — 袁总样本（缺失/未知字段不伪造）", () => {
  const result = extractMeetingInsight(YUANZONG_INPUT)

  it("预算缺失时不强造（空数组保留）", () => {
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.budgets).toEqual([])
  })

  it("未知决策阶段保留 raw 并标 unresolved，不映射成可执行阶段", () => {
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.decisionStage).toBe("")
    expect(result.insight.decisionStageRaw).toBe("正在比价中")
    expect(result.insight.decisionStageUnresolved).toBe(true)
  })
})

describe("校验与去噪", () => {
  it("既无目标也无交付任务 → ok:false（非有效会议）", () => {
    const result = extractMeetingInsight({
      meetingTitle: "闲聊",
      customer: "某人",
      pains: ["随便聊聊"],
      goals: [],
      budgets: [],
      decisionStage: "初步接触",
      objections: [],
      followUps: [],
      diagnosisQuestions: [],
      topicCandidates: [],
      deliveryTasks: [],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/目标|交付|有效/)
  })

  it("去除空白条目与重复项，截断超长字符串", () => {
    const result = extractMeetingInsight({
      meetingTitle: "T",
      customer: "C",
      pains: ["  痛点A  ", "", "痛点A", "   "],
      goals: ["目标B"],
      budgets: [],
      decisionStage: "初步接触",
      objections: [],
      followUps: [],
      diagnosisQuestions: [],
      topicCandidates: [],
      deliveryTasks: [],
    })
    if (!result.ok) throw new Error("expected ok")
    // 去空白 + 去重：只剩 1 条"痛点A"。
    expect(result.insight.pains).toEqual(["痛点A"])
  })

  it("交付任务去重并保留 owner", () => {
    const result = extractMeetingInsight({
      meetingTitle: "T",
      customer: "C",
      pains: [],
      goals: [],
      budgets: [],
      decisionStage: "初步接触",
      objections: [],
      followUps: [],
      diagnosisQuestions: [],
      topicCandidates: [],
      deliveryTasks: [
        { title: "出方案", owner: "我方" },
        { title: "出方案", owner: "我方" },
        { title: "  ", owner: "" },
      ],
    })
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.deliveryTasks).toEqual([{ title: "出方案", owner: "我方" }])
  })
})

describe("预算数值解析", () => {
  it("从字符串里抽出金额（万元/元）", () => {
    const result = extractMeetingInsight({
      meetingTitle: "T",
      customer: "C",
      pains: [],
      goals: ["目标"],
      budgets: ["种子轮 1500 万", "第三方服务费约 20 万", "无明确金额"],
      decisionStage: "初步接触",
      objections: [],
      followUps: [],
      diagnosisQuestions: [],
      topicCandidates: [],
      deliveryTasks: [],
    })
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.budgetFigures).toContain(15000000)
    expect(result.insight.budgetFigures).toContain(200000)
    // "无明确金额"抽不到，不伪造。
    expect(result.insight.budgetFigures).toHaveLength(2)
    expect(result.insight.budgetSpecified).toBe(true)
  })

  it("全部预算无金额 → budgetSpecified:false", () => {
    const result = extractMeetingInsight({
      meetingTitle: "T",
      customer: "C",
      pains: [],
      goals: ["目标"],
      budgets: ["预算待定"],
      decisionStage: "初步接触",
      objections: [],
      followUps: [],
      diagnosisQuestions: [],
      topicCandidates: [],
      deliveryTasks: [],
    })
    if (!result.ok) throw new Error("expected ok")
    expect(result.insight.budgetSpecified).toBe(false)
    expect(result.insight.budgetFigures).toEqual([])
  })
})

describe("buildWorkItemReviewFields — 接经营事项 submit_review", () => {
  it("把洞察摘要与结果链接组装成可回写飞书的字段", () => {
    const result = extractMeetingInsight(ZHONGRUDA_INPUT)
    if (!result.ok) throw new Error("expected ok")
    const fields = buildWorkItemReviewFields(result.insight, {
      aimResultId: "insight_zhongruda_001",
      resultLink: "https://aim.example.com/insight/001",
    })
    expect(fields["AIM结果ID"]).toBe("insight_zhongruda_001")
    // WP-5 字段契约：「结果链接」是 URL 文本字段，必须写字符串，不能写对象。
    expect(fields["结果链接"]).toBe("https://aim.example.com/insight/001")
    expect(typeof fields["结果链接"]).toBe("string")
    // 摘要必须含客户与关键产出计数，便于团队在飞书直接判断。
    expect(fields["结果摘要"]).toMatch(/中汝达|葛老板/)
    expect(typeof fields["结果摘要"]).toBe("string")
    // 摘要有长度上限保护，不爆飞书字段。
    expect((fields["结果摘要"] as string).length).toBeLessThanOrEqual(2000)
  })
})

describe("MEETING_DECISION_STAGES", () => {
  it("暴露决策阶段枚举", () => {
    expect(MEETING_DECISION_STAGES).toContain("需求确认")
    expect(MEETING_DECISION_STAGES).toContain("已成交")
    expect(Array.isArray(MEETING_DECISION_STAGES)).toBe(true)
  })
})
