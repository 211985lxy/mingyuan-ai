import { beforeEach, describe, expect, it, vi } from "vitest"

import { runMeetingInsightWorkflow, type MeetingWorkflowPorts } from "@/lib/aim/meeting-workflow"
import type { WorkItemRecordStore } from "@/lib/aim/services/work-item-execution"

// WP-6B 会议洞察工作流测试。
// 不连真实 LLM / 飞书 / DB：三个端口全部注入（store / complete / resultSink）。
// 对照简报：成功流程 待处理→处理中→待人工审核；失败流程 处理中→失败保留可行动错误；重复执行幂等。

/** 内存 store：追踪 get/update 调用与当前记录状态。 */
function makeStore(initialStatus: string): WorkItemRecordStore & {
  updates: Array<{ recordId: string; fields: Record<string, unknown> }>
  setStatus(status: string): void
} {
  let status = initialStatus
  const updates: Array<{ recordId: string; fields: Record<string, unknown> }> = []
  return {
    updates,
    async get(recordId) {
      return { recordId, fields: { 状态: status, AIM结果ID: "", 结果摘要: "", 结果链接: "", 错误信息: "" } }
    },
    async update(recordId, fields) {
      updates.push({ recordId, fields })
      if (typeof fields["状态"] === "string") status = fields["状态"]
      return { ok: true }
    },
    setStatus(s) {
      status = s
    },
  }
}

/** 合法模型 JSON 输出（九类齐全）。 */
const GOOD_MODEL_JSON = JSON.stringify({
  pains: ["无技术壁垒", "缺背书"],
  goals: ["今年冲3000万", "完成种子轮融资"],
  budgets: ["种子轮1500万"],
  decisionStage: "需求确认",
  objections: ["顾问认为现在招投融资专人太早"],
  followUps: ["先走银行贷款", "路演5轮"],
  diagnosisQuestions: ["估值口径1.5亿还是3亿"],
  topicCandidates: ["智慧供暖省电30%+的故事"],
  deliveryTasks: [{ title: "制作融资PPT", owner: "葛老板" }],
})

/** 结果落盘端口替身：返回固定 aimResultId/resultLink。 */
function makeResultSink(): MeetingWorkflowPorts["resultSink"] & { saved: unknown[] } {
  const saved: unknown[] = []
  return {
    saved,
    async save(input) {
      saved.push(input)
      return { aimResultId: "insight_result_001", resultLink: "https://aim.example.com/insight/001" }
    },
  }
}

function ports(initialStatus: string, modelContent: string): MeetingWorkflowPorts & {
  store: ReturnType<typeof makeStore>
  resultSink: ReturnType<typeof makeResultSink>
} {
  const store = makeStore(initialStatus)
  const resultSink = makeResultSink()
  return {
    store,
    resultSink,
    complete: vi.fn().mockResolvedValue({ content: modelContent }),
  } as MeetingWorkflowPorts & {
    store: ReturnType<typeof makeStore>
    resultSink: ReturnType<typeof makeResultSink>
  }
}

const WORKFLOW_INPUT = {
  recordId: "rec_001",
  meetingTitle: "中汝达数字供暖 · 融资咨询",
  customer: "中汝达数字供暖（葛老板）",
  transcript: "葛老板做数字供暖，年营收1300万想冲3000万，种子轮上限1500万，短板是无技术壁垒缺背书。",
  projectId: "proj_1",
}

beforeEach(() => vi.clearAllMocks())

describe("runMeetingInsightWorkflow — 成功流程", () => {
  it("待处理 → 处理中 → 待人工审核，最终 ok + 待人工审核状态", async () => {
    const p = ports("待处理", GOOD_MODEL_JSON)
    const result = await runMeetingInsightWorkflow(WORKFLOW_INPUT, p)

    expect(result.ok).toBe(true)
    // 状态轨迹：先写“处理中”，再写“待人工审核”。
    const statuses = p.store.updates.map((u) => u.fields["状态"])
    expect(statuses).toEqual(["处理中", "待人工审核"])
    // submit_review 的回写含结果ID/摘要/链接。
    const review = p.store.updates[1].fields
    expect(review["AIM结果ID"]).toBe("insight_result_001")
    expect(review["结果链接"]).toBe("https://aim.example.com/insight/001")
    // WP-5 契约：结果链接是字符串，不是对象。
    expect(typeof review["结果链接"]).toBe("string")
    expect(typeof review["结果摘要"]).toBe("string")
    expect((review["结果摘要"] as string).length).toBeGreaterThan(0)
    // 结果端口被调用一次（落盘完整洞察）。
    expect(p.resultSink.saved).toHaveLength(1)
  })

  it("调用了模型（json_object 模式）", async () => {
    const p = ports("待处理", GOOD_MODEL_JSON)
    await runMeetingInsightWorkflow(WORKFLOW_INPUT, p)
    expect(p.complete).toHaveBeenCalledTimes(1)
    const opts = (p.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as { responseFormat?: { type: string } }
    expect(opts.responseFormat?.type).toBe("json_object")
  })
})

describe("runMeetingInsightWorkflow — 失败流程（处理中 → 失败，保留可行动错误）", () => {
  it("模型返回坏 JSON → 进入失败，写可行动错误，不写结果字段", async () => {
    const p = ports("待处理", "这不是JSON")
    const result = await runMeetingInsightWorkflow(WORKFLOW_INPUT, p)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/JSON|解析/)
    // 状态轨迹：先“处理中”，失败后“失败”。
    const statuses = p.store.updates.map((u) => u.fields["状态"])
    expect(statuses).toEqual(["处理中", "失败"])
    // 失败 patch 不伪造结果。
    const failPatch = p.store.updates[1].fields
    expect(failPatch["AIM结果ID"]).toBeUndefined()
    expect(typeof failPatch["错误信息"]).toBe("string")
    expect((failPatch["错误信息"] as string).length).toBeGreaterThan(0)
    // 结果未落盘。
    expect(p.resultSink.saved).toHaveLength(0)
  })

  it("模型调用抛错 → 进入失败，错误含上游信息", async () => {
    const p = ports("待处理", "")
    ;(p.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("上游 503"))
    const result = await runMeetingInsightWorkflow(WORKFLOW_INPUT, p)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("503")
    expect(p.store.updates.map((u) => u.fields["状态"])).toEqual(["处理中", "失败"])
  })

  it("域校验失败（既无目标也无交付任务）→ 进入失败", async () => {
    const p = ports("待处理", JSON.stringify({ pains: ["只有痛点"], decisionStage: "初步接触" }))
    const result = await runMeetingInsightWorkflow(WORKFLOW_INPUT, p)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/目标|交付|有效/)
    expect(p.store.updates.map((u) => u.fields["状态"])).toEqual(["处理中", "失败"])
  })
})

describe("runMeetingInsightWorkflow — 幂等", () => {
  it("已在待人工审核且结果一致 → 幂等命中，不重复回写、不重复落盘、不重复调模型", async () => {
    // 构造一个已处于待人工审核、且结果ID/链接一致的记录。
    const store = makeStore("待人工审核")
    // 让 get 返回已含结果的记录。
    ;(store as unknown as { get: ReturnType<typeof vi.fn> }).get = vi.fn(async () => ({
      recordId: "rec_001",
      fields: {
        状态: "待人工审核",
        AIM结果ID: "insight_result_001",
        结果摘要: "已抽取",
        结果链接: "https://aim.example.com/insight/001",
        错误信息: "",
      },
    }))
    const complete = vi.fn()
    const resultSink = makeResultSink()
    const result = await runMeetingInsightWorkflow(WORKFLOW_INPUT, { store, complete, resultSink })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.idempotent).toBe(true)
    expect(complete).not.toHaveBeenCalled()
    expect(resultSink.saved).toHaveLength(0)
    expect(store.updates).toHaveLength(0)
  })
})

describe("runMeetingInsightWorkflow — 空 transcript", () => {
  it("transcript 为空 → 失败，不调模型", async () => {
    const p = ports("待处理", GOOD_MODEL_JSON)
    const result = await runMeetingInsightWorkflow({ ...WORKFLOW_INPUT, transcript: "   " }, p)

    expect(result.ok).toBe(false)
    expect(p.complete).not.toHaveBeenCalled()
  })
})
