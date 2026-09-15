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
  buildEvalChatHandlerInput,
} from "@/lib/aim-harness/eval-real-executor"

describe("aim-harness eval runner (frozen, deterministic)", () => {
  it("samples deterministically", () => {
    const a = sampleFixtures(ALL_FIXTURES, 15).map((f) => f.id)
    const b = sampleFixtures(ALL_FIXTURES, 15).map((f) => f.id)
    expect(a).toEqual(b)
    expect(a).toHaveLength(15)
  })

  it("keeps every WP-1 contract regression in the daily 15-case sample", () => {
    const regressions = ALL_FIXTURES.filter((fixture) => fixture.contractRegressionOnly)
    expect(regressions.map((fixture) => fixture.id).sort()).toEqual([
      "wp1_analysis_not_script_01",
      "wp1_missing_body_01",
    ])

    const daily = sampleFixtures(ALL_FIXTURES, 15).map((fixture) => fixture.id)
    expect(daily).toEqual(expect.arrayContaining(regressions.map((fixture) => fixture.id)))

    const baseline = ALL_FIXTURES.filter((fixture) => !fixture.contractRegressionOnly)
    const nonRegressionDaily = daily.filter((id) => !regressions.some((fixture) => fixture.id === id))
    expect(baseline).toHaveLength(ALL_FIXTURES.length - regressions.length)
    expect(nonRegressionDaily).toEqual(sampleFixtures(baseline, 13).map((fixture) => fixture.id))
  })

  it("exposes knowledge numbers as already-given facts for the hallucination fixture", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cp_learnings_hallucination_26")!
    const ctx = await createFrozenContextAdapter().load(fixture)
    expect(ctx.knowledgeBlock).toContain("1800")
    expect(ctx.knowledgeBlock).toContain("1100")
    expect(ctx.knowledgeBlock.indexOf("1800")).toBeLessThan(ctx.knowledgeBlock.indexOf("禁止编造未给出的数字"))
    expect(ctx.knowledgeBlock).toContain("不算编造")
    expect(ctx.knowledgeBlock).toContain("不要自行加减出新数字")
  })

  it("feeds frozen IP wiki into real chat execution", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "pq_ground_15")!
    const chatFixture = {
      ...fixture,
      entrypoint: "chat" as const,
    }
    const ctx = await createFrozenContextAdapter().load(chatFixture)
    const input = buildEvalChatHandlerInput(chatFixture, ctx)
    expect(input.ipWikiBlock).toContain("IP定位")
    expect(input.knowledgeBlock).toContain("主推产品")
  })

  it("rotates the provider offset on each empty-body retry so the next attempt starts on another line", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    const offsets: string[] = []
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        offsets.push(process.env.AIM_EVAL_PROVIDER_OFFSET ?? "missing")
        throw new Error("模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。")
      },
    })

    expect(offsets).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"])
    expect(process.env.AIM_EVAL_PROVIDER_OFFSET).toBeUndefined()
    expect(report.contractPassRate).toBe(0)
    expect(report.results[0]?.error).toContain("未能返回完整正文")
  })

  it("retries a real-model case once when the provider returns an empty-body error", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls === 1) {
          throw new Error("模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。")
        }
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "重试后交出的完整正文，长度足够用于发布。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_retry_ok",
        }
      },
    })

    expect(calls).toBe(2)
    expect(report.contractPassRate).toBe(1)
    expect(report.results[0]?.error).toBeUndefined()
  })

  it("retries a real-model case twice when the provider keeps returning an empty body", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls < 3) {
          throw new Error("模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。")
        }
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "第三次才交出的完整正文，长度足够用于发布。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_retry_third_ok",
        }
      },
    })

    expect(calls).toBe(3)
    expect(report.contractPassRate).toBe(1)
  })

  it("retries a real-model case through the fifth attempt when empty bodies keep coming", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls < 5) {
          throw new Error("生成结果没有满足你当前的要求，未作为正式成稿交付。")
        }
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "第五次才交出的完整正文，长度足够用于发布。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_retry_fifth_ok",
        }
      },
    })

    expect(calls).toBe(5)
    expect(report.contractPassRate).toBe(1)
    expect(report.results[0]?.error).toBeUndefined()
  })

  it("retries a real-model case through the eighth attempt when empty bodies keep coming", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls < 8) {
          throw new Error("生成失败，请稍后重试")
        }
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "第八次才交出的完整正文，长度足够用于发布。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_retry_eighth_ok",
        }
      },
    })

    expect(calls).toBe(8)
    expect(report.contractPassRate).toBe(1)
    expect(report.results[0]?.error).toBeUndefined()
  })

  it("retries a spoken draft that stops mid-sentence instead of scoring the stump", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cp_imitate_07")!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls === 1) {
          return {
            drafts: [{
              format: "video_script",
              content: "发了不少内容，询盘没几个。先别急着怪产品。做企业客户的老板，卡在这一步的特别多。不是不专业，恰恰是太专业了，专业",
            }],
            citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
            runId: "run_truncated_first",
          }
        }
        return {
          drafts: [{
            format: "video_script",
            content: "发了不少内容，询盘没几个。先别急着怪产品。评论区扣清单，我发你对照表。",
          }],
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_truncated_retry_ok",
        }
      },
    })

    expect(calls).toBe(2)
    expect(report.contractPassRate).toBe(1)
    expect(report.results[0]?.drafts[0]?.contentPreview).toContain("评论区扣清单")
  })

  it("still scores a spoken draft if every retry stays truncated", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cp_imitate_07")!
    let calls = 0
    const stump = "发了不少内容，询盘没几个。先别急着怪产品。做企业客户的老板，卡在这一步的特别多。不是不专业，恰恰是太专业了，专业"
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        return {
          drafts: [{ format: "video_script", content: stump }],
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: `run_truncated_keep_${calls}`,
        }
      },
    })

    expect(calls).toBe(8)
    expect(report.results[0]?.error).toBeUndefined()
    expect(report.results[0]?.drafts[0]?.contentPreview).toContain("太专业了")
  })

  it("retries a real-model case once when delivery is rejected as unfinished", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls === 1) {
          throw new Error("生成结果没有满足你当前的要求，未作为正式成稿交付。")
        }
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "重试后交出的完整正文，长度足够用于发布。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_delivery_retry_ok",
        }
      },
    })

    expect(calls).toBe(2)
    expect(report.contractPassRate).toBe(1)
  })

  it("retries a real-model case once when generation throws the generic retry message", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const report = await runEvalSuite([fixture], createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        if (calls === 1) {
          throw new Error("生成失败，请稍后重试")
        }
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "重试后交出的完整正文，长度足够用于发布。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          runId: "run_generic_retry_ok",
        }
      },
    })

    expect(calls).toBe(2)
    expect(report.contractPassRate).toBe(1)
    expect(report.results[0]?.error).toBeUndefined()
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
    expect(warnedInsufficientInfo([
      { content: "你想写什么主题？先把产品和对象告诉我，我才能写。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "好的老板，这句信息量还不够，我不编。先确认一个，剩下三行补给我就能直接出稿：" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "好的老板，你这条没给选题、没给行业、没给案例，我按「问题解决型」先落一版。凡是你的真实信息，我用【】标出来，【】里的东西我一个都没替你编。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: `---

## 标题备选

1. 别急着做IP，先回答这四个问题
2. 定位做不出来，九成不是文案问题
3. 我为什么不先给你写简介

# 别急着做IP，先回答这四个问题

老板找我做IP，第一句话往往是："帮我起个号名，写段简介"。` },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "这份方案现在只能算半成品。没有行业、没有产品、没有客户、没有一个能拿出去晒的结果。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "好的老板，这个我直接说：**现在手上一条你的生意信息都没有，写出来就是编的，我不干这个。**" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "好的老板。\n\n现在手里只有「写个文案」这四个字——行业、产品、卖给谁、发在哪、要谁来，全都没有。这样直接出稿，我只能靠编，编出来的东西你不敢发。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "这篇我现在写不了成稿——不是不会写，是手上一条能落地的事实都没有：不知道你卖给谁、卖什么、打的是哪类客户、客户在烦什么。" },
    ])).toBe(true)
    expect(warnedInsufficientInfo([
      { content: "好的老板。写之前我就卡一件事，得先定它：\n\n**这条内容更想达成哪个目标？**\nA. 获客线索（留资/私信/预约诊断）\nB. 成交转化（报名/购买）\nC. 人设信任（来时路/专业可信）\nD. 品牌曝光（起号/流量/品宣）\n\n你回个字母就行。" },
    ])).toBe(true)
  })

  it("shows the judge the frozen context used by the real executor", () => {
    const fixture = ALL_FIXTURES.find((item) => item.id === "cp_imitate_xhs_09")!
    const prompt = buildRubricPrompt(fixture, "用数字、痛点和悬念写出的小红书笔记。")

    expect(prompt).toContain("爆款标题套路：数字+痛点+悬念")
    expect(prompt).toContain("比如/例如/假设")
    expect(prompt).toContain("属于创意表达，不得判为编造")
    expect(prompt).toContain("我有个学员张三成交了 8 万")
    expect(prompt).toContain("即使档案没写过，也不得判为编造")
    expect(prompt).toContain("未提供/待补充")
    expect(prompt).toContain("直接加减得到的差值")
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
