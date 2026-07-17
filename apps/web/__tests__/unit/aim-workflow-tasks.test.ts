import { describe, expect, it } from "vitest"
import { deriveAimWorkflowTasks, groupAimWorkflowTasks } from "@/features/aim/workflow/tasks"
import type { AimGeneration } from "@/lib/api/client"

function record(overrides: Partial<AimGeneration>): AimGeneration {
  return {
    id: "g1",
    rawInput: "围绕客户问题写一条内容",
    videoScript: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    formatsRequested: [],
    knowledgeUsed: [],
    createdAt: "2026-07-11T00:00:00.000Z",
    workflowStatus: "draft",
    ...overrides,
  }
}

describe("derived AIM workflow tasks", () => {
  it("maps direction agents, content drafts, publish-ready and unreviewed published items", () => {
    const tasks = deriveAimWorkflowTasks([
      record({ id: "direction", agentId: "business_diagnosis" }),
      record({ id: "content", agentId: "content_producer" }),
      record({ id: "publish", workflowStatus: "ready_to_publish" }),
      record({ id: "results", workflowStatus: "published", retroSnapshots: [] }),
      record({ id: "done", workflowStatus: "published", retroSnapshots: [{ summary: "有效" }] }),
    ])
    expect(tasks.map((task) => `${task.id}:${task.stage}`)).toEqual([
      "direction:direction",
      "content:content",
      "publish:publish",
      "results:results",
    ])
    expect(tasks.find((task) => task.id === "results")?.nextAction).toContain("发布后第 7 天复盘")
  })

  it("does not surface archived or already-reviewed content", () => {
    const groups = groupAimWorkflowTasks([
      record({ id: "archived", workflowStatus: "archived" }),
      record({ id: "reviewed", workflowStatus: "published", retroSnapshots: [{ summary: "完成" }] }),
    ])
    expect(Object.values(groups).flat()).toHaveLength(0)
  })
})
