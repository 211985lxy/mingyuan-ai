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
  it("项目主推产品作为核心信息假设，不重复生成核心信息问题", async () => {
    const result = await generatePlanQuestions(baseInput)
    expect(result.assumptions).toEqual(expect.arrayContaining([expect.objectContaining({ field: "coreMessage", value: "AI营销咨询" })]))
    expect(result.questions.some((question) => question.targetField === "coreMessage")).toBe(false)
  })

  it("档案读取失败向上抛出，不把故障伪装成空档案", async () => {
    findMany.mockRejectedValueOnce(new Error("database unavailable"))
    await expect(generatePlanQuestions(baseInput)).rejects.toThrow("database unavailable")
  })

  it("第二轮仍有问题时 ready 为 false，避免未回答就展示任务单", async () => {
    listIpWikiPages.mockResolvedValue([
      { id: "wiki-1", projectId: "project-1", pageType: "content_strategy", title: "内容策略", content: "第一条内容策略\n第二条内容策略", frontmatter: {}, sources: [], links: [], sourceGenerationId: null, version: 1, status: "active", createdAt: new Date(), updatedAt: new Date() },
    ])
    const result = await generatePlanQuestions({ ...baseInput, round: 2, totalQuestionsAsked: 1 })
    expect(result.questions.length).toBeGreaterThan(0)
    expect(result.ready).toBe(false)
  })
})
