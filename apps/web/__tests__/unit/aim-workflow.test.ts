import { describe, expect, it } from "vitest"
import {
  AIM_CONTENT_ACTIONS,
  AIM_WORKFLOW_STAGES,
  applyConfirmedWorkflowBrief,
  getWorkflowStageForAgent,
  parseConfirmedWorkflowBrief,
} from "@/lib/aim-workflow"
import { buildTaskSpecSkeleton } from "@/lib/task-spec"

const baseSpec = buildTaskSpecSkeleton({
  agentId: "content_producer",
  taskType: "write_script",
  rawInput: "写一条内容",
  project: {
    name: "测试项目",
    targetCustomer: "创业者",
    industry: "咨询",
    offer: "诊断服务",
    deliveryGoal: "预约沟通",
  },
  topicSelection: null,
  knowledgeTitles: [],
})

describe("AIM workflow", () => {
  it("exposes exactly four user-facing stages and four content actions", () => {
    expect(AIM_WORKFLOW_STAGES.map((item) => item.id)).toEqual(["direction", "content", "publish", "results"])
    expect(AIM_CONTENT_ACTIONS.map((item) => item.id)).toEqual(["new_copy", "edit_current", "rewrite_reference", "repurpose"])
  })

  it("keeps legacy agents inside their workflow stage", () => {
    expect(getWorkflowStageForAgent("business_diagnosis")).toBe("direction")
    expect(getWorkflowStageForAgent("free_copywriter")).toBe("content")
    expect(getWorkflowStageForAgent("content_review")).toBe("publish")
  })

  it("accepts only editable confirmed fields and marks manual supplements", () => {
    const confirmed = parseConfirmedWorkflowBrief({
      goal: "让创业者理解诊断价值",
      targetCustomer: "有增长焦虑的老板",
      contentTask: "建立专业信任",
      desiredAction: "预约诊断",
      userSupplement: "客户常说：不知道内容到底怎么带来线索",
      inventedKnownFacts: "不应接受",
    })
    const result = applyConfirmedWorkflowBrief(baseSpec, confirmed)
    expect(result.goal).toBe("让创业者理解诊断价值")
    expect(result.contentTask).toBe("建立专业信任")
    expect(result.knownFacts.some((fact) => fact.source === "用户补充")).toBe(true)
    expect(result.knownFacts.some((fact) => fact.statement.includes("不应接受"))).toBe(false)
  })
})
