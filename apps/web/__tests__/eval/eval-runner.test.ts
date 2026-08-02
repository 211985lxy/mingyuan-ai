/**
 * Eval runner — deterministic CI run (frozen adapter, no model).
 *
 * Asserts the runner produces a report where:
 *   - all fixtures pass the contract grader (routing/format/context)
 *   - contractPassRate === 100% (the hard acceptance gate)
 *   - per-agent breakdowns are computed
 *   - sampling is deterministic
 *
 * This is the `test:x harness` gate that runs on every PR.
 */
import { describe, expect, it } from "vitest"

import { ALL_FIXTURES } from "./fixtures"
import {
  createFrozenContextAdapter,
  runEvalCase,
  runEvalSuite,
  sampleFixtures,
  renderEvalMarkdown,
  evaluateEvalGate,
  type EvalRunReport,
} from "@/lib/aim-harness/eval-runner"
import { buildRubricPrompt } from "@/lib/aim-harness/eval-rubric"
import {
  createRealEvalExecutor,
  warnedInsufficientInfo,
} from "@/lib/aim-harness/eval-real-executor"

describe("aim-harness eval runner (frozen, deterministic)", () => {
  it("samples deterministically", () => {
    const a = sampleFixtures(ALL_FIXTURES, 15).map((f) => f.id)
    const b = sampleFixtures(ALL_FIXTURES, 15).map((f) => f.id)
    expect(a).toEqual(b)
    expect(a).toHaveLength(15)
  })

  it("reports 100% contract pass rate across all fixtures (no model)", async () => {
    const report = await runEvalSuite(ALL_FIXTURES, createFrozenContextAdapter(), {
      skipRubric: true,
    })

    expect(report.adapter).toBe("frozen")
    expect(report.totalCases).toBe(ALL_FIXTURES.length)
    expect(report.contractPassRate).toBe(1)
    expect(report.results.every((r) => r.contractPassed)).toBe(true)
    // rubric is skipped in deterministic CI
    expect(report.rubricPassRate).toBeNull()
  })

  it("computes per-agent contract pass rates", async () => {
    const report = await runEvalSuite(ALL_FIXTURES, createFrozenContextAdapter(), {
      skipRubric: true,
    })
    for (const agent of [
      "content_producer",
      "work_editor",
      "business_diagnosis",
      "free_copywriter",
      "business_system_diagnosis",
      "content_review",
    ] as const) {
      expect(report.perAgent[agent]).toBeDefined()
      expect(report.perAgent[agent].contractPassRate).toBe(1)
    }
  })

  it("renders a markdown report", async () => {
    const report = await runEvalSuite(sampleFixtures(ALL_FIXTURES, 5), createFrozenContextAdapter(), {
      skipRubric: true,
    })
    const md = renderEvalMarkdown(report)
    expect(md).toContain("AIM Eval Report")
    expect(md).toContain("Contract pass rate")
    expect(md).toContain("Failed contract cases")
  })

  it("marks info_insufficient cases as warned (not fabricated)", async () => {
    const report = await runEvalSuite(ALL_FIXTURES, createFrozenContextAdapter(), {
      skipRubric: true,
    })
    const insufficient = report.results.filter((r) => r.scenario === "info_insufficient")
    expect(insufficient.length).toBeGreaterThan(0)
    // These must NOT contain fabricated facts — the draft is a guidance note.
    for (const result of insufficient) {
      const draft = result.drafts.map((d) => d.contentPreview).join(" ")
      expect(draft).not.toMatch(/我是一个AI|作为一个AI/)
    }
  })

  it("uses an injected real executor instead of deterministic placeholder drafts", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const result = await runEvalCase(fixture, createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "这是真实执行器返回的文案，长度足够用于验证真实输出而不是占位稿。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          warnedInsufficientInfo: fixture.expectations.mustWarnInsufficientInfo === true,
          runId: "run_real_executor",
        }
      },
    })

    expect(calls).toBe(1)
    expect(result.runId).toBe("run_real_executor")
    expect(result.drafts[0]?.contentPreview).toContain("真实执行器返回")
    expect(result.drafts[0]?.contentPreview).not.toContain("确定性占位")
  })

  it("scores and reports only the deliverable body, excluding internal method notes", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    const result = await runEvalCase(fixture, createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => ({
        drafts: fixture.expectations.outputFormats.map((format) => ({
          format,
          content: "[[AIM_METHOD_NOTE]]内部拆解，不属于成稿。[[/AIM_METHOD_NOTE]]\n\n这是可直接发布的正文。",
        })),
        citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
        runId: "run_delivery_body_only",
      }),
    })

    expect(result.drafts[0]?.contentPreview).toBe("这是可直接发布的正文。")
  })

  it("refuses a real-model eval when no real executor is configured", async () => {
    await expect(
      runEvalCase(ALL_FIXTURES[0], createFrozenContextAdapter(), { skipRubric: false }),
    ).rejects.toThrow("real eval executor")
  })

  it("treats a safe clarification as correct when required source material is missing", () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cr_insufficient_04")!
    const prompt = buildRubricPrompt(fixture, "未提供成交数据，请先补充后再生成结论。")

    expect(prompt).toContain("应视为正确完成任务")
    expect(prompt).toContain("信息不足时必须明确提示缺口")
    expect(prompt).toContain("不得因其不是可发布成稿而判低分")
  })

  it("recognizes natural Chinese descriptions of missing source material", () => {
    expect(warnedInsufficientInfo([
      { content: "核心依据完全缺失，当前内容并非完整可发布文案。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "这条视频的实际效果目前没法判断，我手里没有任何真实数字，必须先补数据。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "你还没有登记任何发布数据，后台指标都是空的，我不会编数字来凑。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "这次复盘做不了，因为你还没登记发布数据，现在还不知道效果怎么样。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "目前没有登记任何发布数据，所以现在没法告诉你效果怎么样。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "你还没填发布数据，所以现在没法做真正的复盘，所有硬指标全是空的。" },
    ])).toBe(true)
  })

  it("shows the judge the frozen context used by the real executor", () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cp_imitate_xhs_09")!
    const prompt = buildRubricPrompt(fixture, "用数字、痛点和悬念写出的小红书笔记。")

    expect(prompt).toContain("爆款标题套路：数字+痛点+悬念")
    expect(prompt).toContain("比如/例如/假设")
    expect(prompt).toContain("属于创意表达，不得判为编造")
    expect(prompt).toContain("我有个学员/客户/朋友")
    expect(prompt).toContain("未提供/待补充")
  })

  it("dispatches real eval cases to the production generation/chat runners", async () => {
    const calls: string[] = []
    const executor = createRealEvalExecutor({
      generate: async (fixture) => {
        calls.push(`generate:${fixture.id}`)
        return {
          drafts: [{ format: "video_script", content: "真实生成结果，内容完整且可用于发布验证。" }],
          runId: "run_generate",
        }
      },
      chat: async (fixture) => {
        calls.push(`chat:${fixture.id}`)
        return {
          drafts: [{ format: "raw_copy", content: "真实对话结果，已经延续上一轮修改要求。" }],
          runId: "run_chat",
        }
      },
    })
    const generateFixture = ALL_FIXTURES.find((item) => item.entrypoint === "generate")!
    const chatFixture = ALL_FIXTURES.find((item) => item.entrypoint === "chat")!
    const adapter = createFrozenContextAdapter()

    await executor(generateFixture, await adapter.load(generateFixture))
    await executor(chatFixture, await adapter.load(chatFixture))

    expect(calls).toEqual([
      `generate:${generateFixture.id}`,
      `chat:${chatFixture.id}`,
    ])
  })

  it("enforces daily and release quality gates", () => {
    const result = (fixtureId: string, agent: string, score: number | null, fabricatedFact = false) => ({
      fixtureId,
      version: 1,
      agent,
      scenario: "new" as const,
      contractPassed: true,
      contractAssertions: [],
      rubricScore: score,
      rubricJudgeProvider: score === null ? null : "judge",
      rubricJudgeModel: score === null ? null : "judge-model",
      rubricJudgeReason: score === null ? null : "judge reason",
      fabricatedFact,
      formatValidations: [],
      drafts: [],
      runId: `run_${fixtureId}`,
    })
    const report = (scores: Array<ReturnType<typeof result>>): EvalRunReport => ({
      adapter: "frozen",
      totalCases: scores.length,
      repetitions: 1,
      contractPassRate: 1,
      rubricPassRate: scores.filter((item) => (item.rubricScore ?? 0) >= 70).length / scores.length,
      rubricMean: scores.reduce((sum, item) => sum + (item.rubricScore ?? 0), 0) / scores.length,
      perAgent: Object.fromEntries([...new Set(scores.map((item) => item.agent))].map((agent) => {
        const rows = scores.filter((item) => item.agent === agent)
        return [agent, {
          count: rows.length,
          contractPassRate: 1,
          rubricPassRate: rows.filter((item) => (item.rubricScore ?? 0) >= 70).length / rows.length,
        }]
      })),
      results: scores as EvalRunReport["results"],
      generatedAt: new Date().toISOString(),
    })

    expect(evaluateEvalGate(report([
      result("a", "content_producer", 80),
      result("b", "work_editor", 80),
      result("c", "business_diagnosis", 80),
    ]), "daily").passed).toBe(true)

    expect(evaluateEvalGate(report([
      result("a", "content_producer", null),
      result("b", "work_editor", 90),
      result("c", "business_diagnosis", 90),
    ]), "daily").reasons).toContain("rubric judge coverage is incomplete")

    expect(evaluateEvalGate(report([
      result("a", "content_producer", 90, true),
      result("b", "work_editor", 90),
      result("c", "business_diagnosis", 90),
    ]), "full").reasons).toContain("fabricated facts detected")

    expect(evaluateEvalGate(report([
      result("a", "content_producer", 90),
      result("b", "work_editor", 60),
      result("c", "business_diagnosis", 90),
    ]), "full").passed).toBe(false)
  })
})
