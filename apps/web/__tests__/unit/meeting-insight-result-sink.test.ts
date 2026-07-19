import { describe, expect, it, vi } from "vitest"

import {
  buildAimResultLink,
  createAimGenerationInsightResultSink,
  renderMeetingInsightMarkdown,
  MEETING_INSIGHT_TASK_SPEC_KIND,
  MEETING_INSIGHT_TASK_SPEC_VERSION,
} from "@/lib/aim/meeting-insight-result-sink"
import type { MeetingInsight } from "@/lib/aim/meeting-insight"

const INSIGHT: MeetingInsight = {
  meetingTitle: "数字供暖项目启动会",
  customer: "葛老板",
  pains: ["无技术壁垒缺背书"],
  goals: ["年营收冲 3000 万"],
  budgets: ["种子轮上限 1500 万"],
  decisionStage: "需求确认",
  decisionStageRaw: "需求确认",
  decisionStageUnresolved: false,
  objections: ["担心交付周期"],
  followUps: ["下周发诊断问卷"],
  diagnosisQuestions: ["现有渠道占比？"],
  topicCandidates: ["数字供暖为什么难做"],
  deliveryTasks: [{ title: "出诊断方案", owner: "李" }],
  budgetFigures: [15_000_000],
  budgetSpecified: true,
}

function makeSink() {
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "gen_test_1", ...args }))
  const sink = createAimGenerationInsightResultSink({
    ownerUserId: "user_owner_1",
    prismaClient: { aimGeneration: { create } },
  })
  return { sink, create }
}

describe("createAimGenerationInsightResultSink", () => {
  it("按 2.1 契约写入 AimGeneration 并返回统一结果链接", async () => {
    const { sink, create } = makeSink()
    const saved = await sink.save({
      insight: INSIGHT,
      recordId: "rec_1",
      projectId: "proj_1",
      meetingTitle: INSIGHT.meetingTitle,
      customer: INSIGHT.customer,
      transcript: "会议原文……",
      executionMetadata: {
        runId: "run_1",
        harnessVersion: "aim-harness-v1",
        provider: "deepseek",
        model: "deepseek-chat",
        fallbackIndex: 0,
        degraded: false,
        promptHash: "prompt_hash",
        contextHash: "context_hash",
        inputTokens: 120,
        outputTokens: 80,
        costCny: 0.00084,
        providerAttempts: [],
      },
      verification: {
        status: "pass",
        checks: [{ id: "check-1", passed: true, critical: true, detail: "通过" }],
        evidenceRefs: ["goal[0]"],
        summary: "验证通过",
        nextAction: "进入人工审核",
      },
      verificationPolicy: "sales-diagnosis-evidence-v1",
    })

    expect(saved).toEqual({
      aimResultId: "gen_test_1",
      resultLink: "/aim?generationId=gen_test_1&projectId=proj_1&stage=results",
    })

    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({
      userId: "user_owner_1",
      agentId: "business_diagnosis",
      projectId: "proj_1",
      rawInput: "会议原文……",
      formatsRequested: ["raw_copy"],
      workflowStatus: "pending_review",
      model: "deepseek-chat",
      totalTokens: 200,
    })
    expect(String(data.rawCopy)).toContain("# 会议洞察")
    expect(String(data.rawCopy)).toContain("葛老板")

    const taskSpec = data.taskSpec as Record<string, unknown>
    expect(taskSpec).toMatchObject({
      kind: MEETING_INSIGHT_TASK_SPEC_KIND,
      schemaVersion: MEETING_INSIGHT_TASK_SPEC_VERSION,
      workItemRecordId: "rec_1",
      meetingTitle: INSIGHT.meetingTitle,
      customer: INSIGHT.customer,
    })
    expect(taskSpec.insight).toEqual(INSIGHT)
    expect(taskSpec.execution).toEqual({
      runId: "run_1",
      provider: "deepseek",
      model: "deepseek-chat",
      inputTokens: 120,
      outputTokens: 80,
      costCny: 0.00084,
    })
    expect(taskSpec.verification).toMatchObject({
      policy: "sales-diagnosis-evidence-v1",
      status: "pass",
      summary: "验证通过",
    })
  })

  it("缺 projectId 拒绝落盘（客户会议不允许落到全局空间）", async () => {
    const { sink, create } = makeSink()
    await expect(
      sink.save({
        insight: INSIGHT,
        recordId: "rec_1",
        meetingTitle: INSIGHT.meetingTitle,
        customer: INSIGHT.customer,
        transcript: "会议原文",
        verification: {
          status: "needs_human",
          checks: [],
          evidenceRefs: [],
          summary: "需人工判断",
          nextAction: "进入人工审核",
        },
        verificationPolicy: "sales-diagnosis-evidence-v1",
      }),
    ).rejects.toThrow(/projectId/)
    expect(create).not.toHaveBeenCalled()
  })

  it("缺负责人配置时构造即 fail-closed", () => {
    expect(() =>
      createAimGenerationInsightResultSink({ ownerUserId: "  ", prismaClient: { aimGeneration: { create: vi.fn() } } }),
    ).toThrow(/OWNER_USER_ID/)
  })
})

describe("buildAimResultLink", () => {
  it("生成计划 2.1 约定的统一链接格式", () => {
    expect(buildAimResultLink("g1", "p1")).toBe("/aim?generationId=g1&projectId=p1&stage=results")
  })
})

describe("renderMeetingInsightMarkdown", () => {
  it("九类洞察全部成节，负责人随任务呈现", () => {
    const md = renderMeetingInsightMarkdown(INSIGHT)
    for (const section of ["客户痛点", "客户目标", "预算", "异议与顾虑", "跟进建议", "诊断问题清单", "内容选题候选", "交付任务"]) {
      expect(md).toContain(`## ${section}`)
    }
    expect(md).toContain("- 出诊断方案（负责人：李）")
    expect(md).toContain("解析金额（元）：15000000")
  })

  it("未知信息标待确认，不伪造", () => {
    const md = renderMeetingInsightMarkdown({
      ...INSIGHT,
      pains: [],
      budgets: [],
      budgetFigures: [],
      budgetSpecified: false,
      decisionStage: "",
      decisionStageRaw: "还在聊",
      decisionStageUnresolved: true,
    })
    expect(md).toContain("决策阶段：待确认（原文：还在聊）")
    expect(md).toContain("## 客户痛点\n- （待确认）")
    expect(md).not.toContain("解析金额")
  })
})
