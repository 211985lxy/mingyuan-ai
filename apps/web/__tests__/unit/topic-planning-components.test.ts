import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { TopicDailyReportPanel } from "@/components/topic-planning/topic-daily-report"
import { TopicCandidatesPanel } from "@/components/topic-planning/topic-candidates-panel"
import { TopicChatCard } from "@/components/topic-planning/topic-chat-card"
import { categorizeTopicCards, getTopicDisplayLabel } from "@/lib/topics/display-groups"
import type { TopicDailyReport } from "@/lib/topic-daily-report"
import type { ApiTopicCard } from "@/types/api"

function card(title: string, overrides: Partial<ApiTopicCard> = {}): ApiTopicCard {
  return {
    title,
    elementCodes: ["trust"],
    openingTypeCode: "pain_open",
    structureCode: "proof_first",
    rationale: "测试理由",
    ...overrides,
  }
}

describe("topic planning components", () => {
  it("keeps the four user-facing topic groups", () => {
    const groups = categorizeTopicCards([
      card("老板创业故事", { topicType: "人设型" }),
      card("行业热点判断", { sourceType: "行业热点" }),
      card("一个反常识观点", { topicType: "流量型" }),
      card("客户为什么不下单"),
    ])
    expect(groups.map((group) => group.label)).toEqual(["热点类", "人设类", "问题解答类", "观点类"])
    expect(getTopicDisplayLabel(groups[1].cards[0])).toBe("人设类")
  })

  it("renders the daily decision, evidence, execution and backup sections", () => {
    const report: TopicDailyReport = {
      leadCard: card("今天主推选题", { score: 90 }),
      conclusion: "这是今天的主推结论。",
      reason: "项目匹配度最高。",
      hasSourceSnapshot: true,
      evidenceGroups: [{
        key: "project",
        label: "项目基准线",
        description: "项目证据",
        items: [{ category: "client_project", title: "客户项目", content: "真实资料" }],
      }],
      workshop: [{ index: 1, title: "备选选题", hook: "备选开头", angle: "备选角度", cta: "备选承接" }],
      execution: { hook: "主推开头", angle: "主推角度", action: "主推承接" },
      copyText: "今日行动文本",
    }
    const html = renderToStaticMarkup(createElement(TopicDailyReportPanel, { report }))
    expect(html).toContain("今天先拍「今天主推选题」")
    expect(html).toContain("判断理由和证据")
    expect(html).toContain("今天怎么讲")
    expect(html).toContain("备选选题")
  })

  it("renders candidate scores, novelty and selected actions", () => {
    const candidate = card("客户为什么不下单", {
      score: 86,
      scoreBreakdown: {
        projectFit: 90,
        contentValue: 80,
        viralHook: 70,
        conversionFit: 85,
        feasibility: 95,
      },
      defamiliarization: {
        noveltyScore: 55,
        scarcityType: "info",
        rhetoric: "bi",
        note: "换一个客户视角",
        advice: "补一条反常识判断",
      },
    })
    const html = renderToStaticMarkup(createElement(TopicCandidatesPanel, {
      cards: [candidate],
      selectedIndex: 0,
      selectedKnowledgeLabels: ["日常灵感 · 客户原话"],
      knowledgeCount: 1,
      autoGenerating: false,
      onSelect: () => {},
      onWrite: () => {},
    }))

    expect(html).toContain("已采用")
    expect(html).toContain("去 AIM 写文案")
    expect(html).toContain("强项是可执行，短板是传播钩子")
    expect(html).toContain("含金量偏低")
    expect(html).toContain("日常灵感 · 客户原话")
  })

  it("renders a temporary idea reply", () => {
    const html = renderToStaticMarkup(createElement(TopicChatCard, {
      value: "客户为什么觉得报价高",
      loading: false,
      disabled: false,
      reply: {
        reply: {
          summary: "先解释价格背后的风险",
          recommendedTitle: "报价高，可能是在替你挡风险",
          opening: "便宜不一定省钱。",
          alternatives: ["成本拆解"],
        },
        cards: [],
        topicSelectionId: "selection-1",
        knowledgeEntry: {
          id: "knowledge-1",
          title: "客户为什么觉得报价高",
          category: "daily_inspiration",
        },
      },
      onChange: () => {},
      onSubmit: () => {},
    }))

    expect(html).toContain("先解释价格背后的风险")
    expect(html).toContain("报价高，可能是在替你挡风险")
    expect(html).toContain("成本拆解")
  })
})
