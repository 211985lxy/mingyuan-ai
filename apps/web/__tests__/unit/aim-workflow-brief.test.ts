import { beforeEach, describe, expect, it, vi } from "vitest"

const { findProject, findGeneration } = vi.hoisted(() => ({
  findProject: vi.fn(),
  findGeneration: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findFirst: findProject },
    aimGeneration: { findFirst: findGeneration },
  },
}))

import { buildWorkflowBrief } from "@/lib/aim-workflow-brief"

describe("workflow brief authorization and precedence", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findProject.mockResolvedValue(null)
    findGeneration.mockResolvedValue(null)
  })

  it("rejects a project that is not accessible to the current user", async () => {
    await expect(buildWorkflowBrief({
      userId: "user-1",
      stage: "direction",
      projectId: "project-other",
    })).rejects.toThrow("项目不存在或无权访问")

    expect(findProject).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-other", userId: "user-1" },
    }))
  })

  it("rejects a source generation that is not accessible to the current user", async () => {
    await expect(buildWorkflowBrief({
      userId: "user-1",
      stage: "content",
      sourceGenerationId: "generation-other",
    })).rejects.toThrow("来源内容不存在或无权访问")

    expect(findGeneration).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "generation-other", userId: "user-1" },
    }))
  })

  it("lets confirmed user fields override authorized source suggestions", async () => {
    findProject.mockResolvedValue({
      id: "project-1",
      name: "测试项目",
      targetCustomer: "创业者",
      industry: "咨询",
      offer: "诊断服务",
      deliveryGoal: "预约沟通",
    })
    findGeneration.mockResolvedValue({
      id: "generation-1",
      projectId: "project-1",
      rawInput: "上游建议",
      taskSpec: {
        goal: "旧目标",
        targetCustomer: "旧客户",
        coreProblem: "旧问题",
        knownFacts: [],
        unknowns: [],
        assumptions: [],
        mustKeep: [],
        forbidden: [],
        desiredAction: "旧动作",
        contentTask: "旧任务",
        recommendedFormats: [],
      },
    })

    const result = await buildWorkflowBrief({
      userId: "user-1",
      stage: "content",
      projectId: "project-1",
      sourceGenerationId: "generation-1",
      confirmed: {
        goal: "用户确认目标",
        targetCustomer: "用户确认客户",
        desiredAction: "预约诊断",
        userSupplement: "客户亲口说不知道内容如何带来线索",
      },
    })

    expect(result.taskSpec.goal).toBe("用户确认目标")
    expect(result.taskSpec.targetCustomer).toBe("用户确认客户")
    expect(result.taskSpec.desiredAction).toBe("预约诊断")
    expect(result.taskSpec.knownFacts).toContainEqual(expect.objectContaining({ source: "用户补充" }))
  })
})
