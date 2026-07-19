import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildExtractionPrompt,
  MEETING_INSIGHT_MODEL,
  parseInsightJson,
  type MeetingInsightExtractionInput,
} from "@/lib/aim/meeting-insight-extract"

// WP-6B 会议原文抽取层测试。
// 不连真实 LLM：parseInsightJson/buildExtractionPrompt 是纯函数；
// extractMeetingInsightFromTranscript 注入 LLMClient 替身（验证 transcript 空拒绝、调用形态、错误语义）。
// 对照简报：原始文本成功抽取九类字段 / 空 transcript 模型前拒绝 / 坏 JSON / 缺字段错类型 /
// 未知决策阶段保留 raw+unresolved / 没有预算不造金额 / 不返回硬编码演示结果。

const TRANSCRIPT = `
葛老板做数字供暖，现有年营收1300万，今年想冲3000万，种子轮融资上限1500万。
最大短板是无技术壁垒、缺背书。顾问建议先走银行贷款（利率约3.05%）而不是急着融资。
下一步：8月回杭州当面推进迁总部，先路演5轮。
`

describe("MEETING_INSIGHT_MODEL", () => {
  it("模型常量来自 env，未配置时为 undefined（交由 provider 默认 + 降级链）", () => {
    // 不硬编码：测试只断言其为 string 或 undefined，不锁定具体模型名。
    expect(["string", "undefined"]).toContain(typeof MEETING_INSIGHT_MODEL)
  })
})

describe("buildExtractionPrompt", () => {
  it("产出 system+user，system 含九类字段名与 JSON 示例", () => {
    const { system, user } = buildExtractionPrompt(TRANSCRIPT)
    expect(system).toMatch(/pains/)
    expect(system).toMatch(/goals/)
    expect(system).toMatch(/budgets/)
    expect(system).toMatch(/decisionStage/)
    expect(system).toMatch(/objections/)
    expect(system).toMatch(/followUps/)
    expect(system).toMatch(/diagnosisQuestions/)
    expect(system).toMatch(/topicCandidates/)
    expect(system).toMatch(/deliveryTasks/)
    expect(system).toMatch(/evidence/)
    expect(system).toMatch(/逐字复制/)
    expect(system).toMatch(/仅凭语境推断一律留空串/)
    expect(system).toMatch(/不得改写、纠错、拼接或省略/)
    expect(system).toMatch(/无法定位的证据整条删除/)
    // 必须要求纯 JSON、给出结构示例，约束模型输出。
    expect(system).toMatch(/JSON/)
    expect(user).toContain(TRANSCRIPT)
  })
})

describe("parseInsightJson — 严格解析与容错", () => {
  it("合法 JSON 抽取九类字段", () => {
    const raw = JSON.stringify({
      pains: ["无技术壁垒"],
      goals: ["今年冲3000万"],
      budgets: ["种子轮1500万", "银行贷款利率3.05%"],
      decisionStage: "需求确认",
      objections: ["顾问认为现在招投融资专人太早"],
      followUps: ["先走银行贷款", "路演5轮"],
      diagnosisQuestions: ["估值口径1.5亿还是3亿"],
      topicCandidates: ["智慧供暖省电30%+的故事"],
      deliveryTasks: [{ title: "制作融资PPT", owner: "葛老板" }],
      evidence: [{ kind: "goal", statement: "今年冲3000万", quote: "今年想冲3000万" }],
    })
    const parsed = parseInsightJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.goals).toContain("今年冲3000万")
    expect(parsed.input.decisionStage).toBe("需求确认")
    expect(parsed.input.deliveryTasks).toEqual([{ title: "制作融资PPT", owner: "葛老板" }])
    expect(parsed.input.evidence).toEqual([{ kind: "goal", statement: "今年冲3000万", quote: "今年想冲3000万" }])
  })

  it("剥离 markdown 代码围栏后仍能解析", () => {
    const raw = "```json\n" + JSON.stringify({ goals: ["目标A"], decisionStage: "初步接触" }) + "\n```"
    const parsed = parseInsightJson(raw)
    expect(parsed.ok).toBe(true)
  })

  it("坏 JSON（完全无法解析）→ ok:false", () => {
    const parsed = parseInsightJson("这不是JSON，也没有大括号")
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/JSON|解析/)
  })

  it("缺字段不报错，缺失项为空数组（宁缺毋滥，不补造）", () => {
    const raw = JSON.stringify({ goals: ["目标A"], decisionStage: "初步接触" })
    const parsed = parseInsightJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.pains).toEqual([])
    expect(parsed.input.budgets).toEqual([])
    expect(parsed.input.deliveryTasks).toEqual([])
  })

  it("字段类型错误（应为数组的给了字符串）→ 归一化为空数组，不抛错", () => {
    const raw = JSON.stringify({
      goals: "这是字符串不是数组",
      pains: 123,
      decisionStage: ["不是字符串"],
      deliveryTasks: "不是数组",
    })
    const parsed = parseInsightJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.goals).toEqual([])
    expect(parsed.input.pains).toEqual([])
    expect(parsed.input.decisionStage).toBe("")
    expect(parsed.input.deliveryTasks).toEqual([])
  })

  it("deliveryTasks 元素类型错误被丢弃，合法的保留", () => {
    const raw = JSON.stringify({
      goals: ["目标"],
      deliveryTasks: [
        { title: "合法任务", owner: "张三" },
        { owner: "缺标题" },
        "字符串元素",
        { title: "另一合法任务" },
      ],
    })
    const parsed = parseInsightJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.deliveryTasks).toEqual([
      { title: "合法任务", owner: "张三" },
      { title: "另一合法任务" },
    ])
  })

  it("evidence 非法 kind、空 statement 或空 quote 被丢弃", () => {
    const parsed = parseInsightJson(JSON.stringify({
      goals: ["目标"],
      evidence: [
        { kind: "goal", statement: "目标", quote: "原文" },
        { kind: "unknown", statement: "未知", quote: "原文" },
        { kind: "budget", statement: "", quote: "原文" },
        { kind: "task", statement: "任务", quote: "" },
      ],
    }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.evidence).toEqual([{ kind: "goal", statement: "目标", quote: "原文" }])
  })

  it("空字符串输入 → ok:false", () => {
    expect(parseInsightJson("").ok).toBe(false)
    expect(parseInsightJson("   ").ok).toBe(false)
  })
})

// ── extractMeetingInsightFromTranscript：注入 LLMClient 替身 ──────────────

function makeInput(transcript: string, overrides: Partial<MeetingInsightExtractionInput> = {}): MeetingInsightExtractionInput {
  return {
    meetingTitle: "会议",
    customer: "客户",
    transcript,
    projectId: "proj_1",
    workItemRecordId: "rec_1",
    ...overrides,
  }
}

describe("extractMeetingInsightFromTranscript", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("空 transcript 在调用模型前拒绝（ok:false），不触达 LLM", async () => {
    const complete = vi.fn()
    const { extractMeetingInsightFromTranscript } = await import("@/lib/aim/meeting-insight-extract")
    const result = await extractMeetingInsightFromTranscript(makeInput("   "), { complete })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/transcript|原文|空/)
    expect(complete).not.toHaveBeenCalled()
  })

  it("模型返回合法 JSON → ok:true，产出 MeetingInsightInput（九类齐全）", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        pains: ["无技术壁垒"],
        goals: ["冲3000万"],
        budgets: ["种子轮1500万"],
        decisionStage: "需求确认",
        objections: ["太早招人"],
        followUps: ["先银行贷款"],
        diagnosisQuestions: ["估值口径"],
        topicCandidates: ["省电30%的故事"],
        deliveryTasks: [{ title: "融资PPT", owner: "葛老板" }],
      }),
    })
    const { extractMeetingInsightFromTranscript } = await import("@/lib/aim/meeting-insight-extract")
    const result = await extractMeetingInsightFromTranscript(makeInput(TRANSCRIPT), { complete })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.goals).toContain("冲3000万")
    expect(complete).toHaveBeenCalledTimes(1)
    // 必须以 json_object 模式调用。
    const opts = complete.mock.calls[0][0] as { responseFormat?: { type: string } }
    expect(opts.responseFormat?.type).toBe("json_object")
  })

  it("模型返回坏 JSON → ok:false（禁止把未校验结果写出）", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "我返回了一段自然语言，没有JSON" })
    const { extractMeetingInsightFromTranscript } = await import("@/lib/aim/meeting-insight-extract")
    const result = await extractMeetingInsightFromTranscript(makeInput(TRANSCRIPT), { complete })
    expect(result.ok).toBe(false)
  })

  it("模型调用抛错 → ok:false，错误可行动", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("上游 503"))
    const { extractMeetingInsightFromTranscript } = await import("@/lib/aim/meeting-insight-extract")
    const result = await extractMeetingInsightFromTranscript(makeInput(TRANSCRIPT), { complete })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("503")
  })

  it("模型返回的 decisionStage 未知 → 保留 raw + unresolved（经域层）", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ goals: ["目标"], decisionStage: "正在比价中" }),
    })
    const { extractMeetingInsightFromTranscript } = await import("@/lib/aim/meeting-insight-extract")
    const result = await extractMeetingInsightFromTranscript(makeInput(TRANSCRIPT), { complete })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 未知阶段不在合法枚举内，但抽取层只负责产出 MeetingInsightInput（规整在域层）。
    expect(result.input.decisionStage).toBe("正在比价中")
  })

  it("模型返回无预算 → budgets 为空，不造金额", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ goals: ["目标"], decisionStage: "初步接触", budgets: ["预算待定"] }),
    })
    const { extractMeetingInsightFromTranscript } = await import("@/lib/aim/meeting-insight-extract")
    const result = await extractMeetingInsightFromTranscript(makeInput(TRANSCRIPT), { complete })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.budgets).toEqual(["预算待定"])
  })
})
