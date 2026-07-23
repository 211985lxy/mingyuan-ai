import { beforeEach, describe, expect, it, vi } from "vitest"

const { findMany, findFirst, listIpWikiPages } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  listIpWikiPages: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { knowledgeEntry: { findMany }, clientProject: { findFirst } } }))
vi.mock("@/lib/ip-wiki/repo", () => ({ listIpWikiPages }))

import { generatePlanQuestions } from "@/lib/aim/plan-option-engine"

const baseInput = {
  projectId: "project-1",
  userId: "user-1",
  requirement: "写一条获客内容",
  confirmedFields: {},
  answeredQuestionIds: [],
  round: 1,
  totalQuestionsAsked: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  listIpWikiPages.mockResolvedValue([])
  findMany.mockResolvedValue([])
  findFirst.mockResolvedValue({ id: "project-1", name: "项目", targetCustomer: "企业老板", industry: "教育", offer: "AI营销咨询", deliveryGoal: "预约诊断" })
})

describe("计划模式档案选项引擎", () => {
  it("项目产品只作为推荐选项，不自动锁定本次核心信息", async () => {
    listIpWikiPages.mockResolvedValue([
      wikiPage("positioning", "定位", "帮助老板把流量变成精准客户\n让 AI 真正进入经营流程"),
    ])
    const result = await generatePlanQuestions(baseInput)
    expect(result.assumptions.some((assumption) => assumption.field === "coreMessage")).toBe(false)
    const question = result.questions.find((item) => item.targetField === "coreMessage")
    expect(question?.options.map((option) => option.text)).toContain("AI营销咨询")
  })

  it("档案读取失败向上抛出，不把故障伪装成空档案", async () => {
    findMany.mockRejectedValueOnce(new Error("database unavailable"))
    await expect(generatePlanQuestions(baseInput)).rejects.toThrow("database unavailable")
  })

  it("第二轮仍有问题时 ready 为 false，避免未回答就展示任务单", async () => {
    listIpWikiPages.mockResolvedValue([
      wikiPage("content_strategy", "内容策略", "第一条内容策略\n第二条内容策略"),
    ])
    const result = await generatePlanQuestions({ ...baseInput, round: 2, totalQuestionsAsked: 1 })
    expect(result.questions.length).toBeGreaterThan(0)
    expect(result.ready).toBe(false)
  })

  it("本次需求参与选项排序，而不是固定截取档案前几行", async () => {
    listIpWikiPages.mockResolvedValue([
      wikiPage("positioning", "定位", "组织管理流程升级\n帮助老板解决精准获客难题\n企业内部人才培养"),
    ])
    const result = await generatePlanQuestions({ ...baseInput, requirement: "写一条精准获客的短视频" })
    const question = result.questions.find((item) => item.targetField === "coreMessage")
    expect(question?.options[0]?.text).toContain("精准获客")
  })

  it("不足两个可靠档案选项时仍追问，但只展示 D 自定义", async () => {
    const result = await generatePlanQuestions(baseInput)
    const question = result.questions.find((item) => item.targetField === "coreMessage")
    expect(question).toBeDefined()
    expect(question?.options).toEqual([])
    expect(question?.hasCustomOption).toBe(true)
    expect(result.ready).toBe(false)
  })

  it("从用户明确需求中提取平台、形式、长度和风格，避免重复追问", async () => {
    const result = await generatePlanQuestions({
      ...baseInput,
      requirement: "写一条用于视频号发布的60秒专业短视频",
    })
    expect(result.taskSpec).toEqual(expect.objectContaining({
      platform: "视频号",
      outputFormat: "短视频",
      lengthRule: "60秒",
      style: "专业",
    }))
    expect(result.questions.some((question) => ["platform", "outputFormat", "lengthRule", "style"].includes(question.targetField))).toBe(false)
  })
})

function wikiPage(pageType: "positioning" | "content_strategy", title: string, content: string) {
  return {
    id: `wiki-${pageType}`,
    projectId: "project-1",
    pageType,
    title,
    content,
    frontmatter: {},
    sources: [],
    links: [],
    sourceGenerationId: null,
    version: 1,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
