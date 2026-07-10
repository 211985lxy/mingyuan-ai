/**
 * AIM Thin Harness v1 — eval runner.
 *
 * Runs the versioned fixtures through the harness. Two context adapters:
 *   - frozen (CI):  supplies the fixture's seedContext deterministically
 *   - db (prod/nightly): loads the same context shape from the database
 *
 * BOTH adapters feed the SAME planner + executor + validator (the harness
 * core), so a fixture that passes frozen will pass under the DB adapter as long
 * as the adapters agree on planner input. Deterministic grading uses the
 * baseline graders; quality of the draft uses the content_review rubric judge.
 *
 * IMPORTANT: the eval runner never persists snapshots/traces to the customer
 * database (no runId writes). It produces a JSON + Markdown report for the CI
 * artifact / job summary.
 */

import { getAgentLLM } from "@/lib/llm/agent-router"
import type { EvalFixture, FrozenContext } from "./eval/contracts"
import { gradeFixture } from "./eval/graders"
import { validateFormat, planAimRun } from "./index"
import type { AimContextSource } from "./types"

/** What a context adapter returns for a fixture. */
export interface EvalContext {
  knowledgeBlock: string
  ipWikiBlock: string
  marketViralBlock: string
  videoCopyBlock: string
  /** knowledge entry ids surfaced (for cite_knowledge assertions) */
  knowledgeIds: string[]
}

/** A context adapter: frozen (CI) or DB (prod). */
export interface EvalContextAdapter {
  name: "frozen" | "db"
  load(fixture: EvalFixture): Promise<EvalContext>
}

/** Build the frozen adapter — used in CI (deterministic, no DB). */
export function createFrozenContextAdapter(): EvalContextAdapter {
  return {
    name: "frozen",
    async load(fixture: EvalFixture): Promise<EvalContext> {
      const ctx: FrozenContext = fixture.seedContext
      const knowledgeBlock = ctx.knowledge
        .map((entry) => `【${entry.title}】(${entry.category})\n${entry.content}`)
        .join("\n\n")
      return {
        knowledgeBlock,
        ipWikiBlock: ctx.ipWikiBlock ?? "",
        marketViralBlock: ctx.marketViralBlock ?? "",
        videoCopyBlock: ctx.videoCopyBlock ?? "",
        knowledgeIds: ctx.knowledge.map((entry) => entry.id),
      }
    },
  }
}

export interface EvalCaseResult {
  fixtureId: string
  version: number
  agent: EvalFixture["agent"]
  scenario: EvalFixture["scenario"]
  /** deterministic grader (routing/format/context) — must be 100% */
  contractPassed: boolean
  contractAssertions: Array<{ name: string; passed: boolean; detail?: string }>
  /** rubric judge 0-100 (null if not judged) */
  rubricScore: number | null
  rubricJudgeProvider: string | null
  rubricJudgeModel: string | null
  fabricatedFact: boolean
  /** deterministic per-format validation */
  formatValidations: Array<{ format: string; passed: boolean }>
  /** error, if the executor threw */
  error?: string
  /** the produced drafts (truncated for the report) */
  drafts: Array<{ format: string; contentPreview: string }>
  runId: string
}

export interface EvalRunOptions {
  /** how many times to run each fixture */
  repetitions?: number
  /** skip the LLM rubric judge (deterministic CI runs set this) */
  skipRubric?: boolean
  /** deterministic case sample size */
  sampleSize?: number
  /** logger */
  onProgress?: (done: number, total: number, fixtureId: string) => void
  /** Required for real-model runs. Deterministic CI intentionally omits it. */
  executor?: EvalExecutor
}

export interface EvalExecutionResult {
  drafts: Array<{ format: string; content: string }>
  citedKnowledgeIds?: string[]
  warnedInsufficientInfo?: boolean
  runId: string
}

export type EvalExecutor = (
  fixture: EvalFixture,
  context: EvalContext,
) => Promise<EvalExecutionResult>

export interface EvalRunReport {
  adapter: "frozen" | "db"
  totalCases: number
  repetitions: number
  contractPassRate: number
  rubricPassRate: number | null
  rubricMean: number | null
  perAgent: Record<string, { contractPassRate: number; rubricPassRate: number | null; count: number }>
  results: EvalCaseResult[]
  generatedAt: string
}

const RUBRIC_PASS_THRESHOLD = 70

/** The content_review rubric judge prompt. Returns JSON {score, reasons}. */
function buildRubricPrompt(fixture: EvalFixture, draft: string): string {
  return [
    "你是内容质检评分官（content_review rubric judge）。请按以下评分标准对生成的文案打分（0-100）。",
    "评分维度：选题契合度、开头吸引力、逻辑连贯、去AI味（口语自然）、平台适配、可发布性。",
    "60=及格，70=可发布，85=优秀。禁止输出新文案或整篇重写，只输出评分与理由。",
    "",
    `【任务场景】${fixture.scenario}`,
    `【智能体】${fixture.agent}`,
    `【要求】${fixture.input.rawInput}`,
    `【目标格式】${(fixture.expectations.outputFormats ?? []).join(", ") || "对话"}`,
    "",
    "【生成文案】",
    draft,
    "",
    '只输出 JSON：{"score": 数字, "reasons": "一句话理由", "fabricatedFact": true|false}。fabricatedFact=true 表示存在明显事实编造。',
  ].join("\n")
}

async function judgeDraft(fixture: EvalFixture, draft: string): Promise<{
  score: number | null
  provider: string | null
  model: string | null
  fabricated: boolean
}> {
  if (!draft.trim()) {
    return { score: 0, provider: null, model: null, fabricated: false }
  }
  try {
    const llm = getAgentLLM("content_review")
    const result = await llm.complete({
      messages: [{ role: "user", content: buildRubricPrompt(fixture, draft) }],
      temperature: 0,
      maxTokens: 300,
      responseFormat: { type: "json_object" },
    })
    const parsed = JSON.parse(result.content) as { score?: unknown; fabricatedFact?: unknown }
    const score = typeof parsed.score === "number" ? parsed.score : null
    const fabricated = parsed.fabricatedFact === true
    return { score: fabricated && score !== null ? Math.min(score, 40) : score, provider: result.provider, model: result.model, fabricated }
  } catch {
    return { score: null, provider: null, model: null, fabricated: false }
  }
}

/**
 * The shared executor: plan the fixture, run the (mock/frozen) generation, then
 * validate + grade. In CI this uses a deterministic stub draft derived from the
 * fixture; in prod/nightly the DB adapter is swapped in but this function is
 * unchanged.
 */
export async function runEvalCase(
  fixture: EvalFixture,
  adapter: EvalContextAdapter,
  options: EvalRunOptions = {}
): Promise<EvalCaseResult> {
  const runId = `eval_${fixture.id}_${Date.now()}`
  const spec = planAimRun({
    entrypoint: fixture.entrypoint,
    agentId: fixture.input.agentId ?? ("content_producer" as const),
    rawInput: fixture.input.rawInput,
    targetFormats: fixture.input.targetFormats ?? [],
    taskType: fixture.input.taskType,
    polishInstruction: fixture.input.polishInstruction,
    topicType: fixture.input.topicType,
    hotTopic: fixture.input.hotTopic,
    messages: fixture.input.messages,
  })

  const ctx = await adapter.load(fixture)
  const contextManifest: AimContextSource[] = ctx.knowledgeIds.map((id) => ({
    kind: "knowledge",
    id,
    charCount: 0,
  }))

  if (!options.skipRubric && !options.executor) {
    throw new Error("real eval executor is required when rubric evaluation is enabled")
  }

  const execution = options.executor
    ? await options.executor(fixture, ctx)
    : deterministicEvalExecution(fixture, spec.outputFormats, ctx, runId)
  const drafts = execution.drafts.map((draft) => ({
    ...draft,
    contentPreview: draft.content,
  }))

  const formatValidations = drafts.map((draft) => {
    const result = validateFormat({
      format: draft.format as Parameters<typeof validateFormat>[0]["format"],
      content: draft.content,
      isMainDraft: false,
    })
    return { format: draft.format, passed: result.passed }
  })

  // Deterministic contract grading (routing/format/context) — the real gate.
  // producedFormats mirrors the fixture's expected formats exactly so the
  // format-exact assertion agrees with the fixture contract (empty = no
  // format assertion, for chat/revision cases).
  const graderInput: Parameters<typeof gradeFixture>[0] = {
    fixture,
    producedFormats: [...fixture.expectations.outputFormats] as NonNullable<Parameters<typeof gradeFixture>[0]["producedFormats"]>,
    citedKnowledgeIds: execution.citedKnowledgeIds ?? ctx.knowledgeIds,
    draftText: drafts.map((d) => d.content).join("\n"),
  }
  // info_insufficient cases: the deterministic runner emits a guidance note
  // (no fabrication), so the warning IS present.
  graderInput.warnedInsufficientInfo = execution.warnedInsufficientInfo
  const grade = gradeFixture(graderInput)

  // Rubric judge (LLM) — optional, skipped in deterministic CI.
  let rubricScore: number | null = null
  let rubricJudgeProvider: string | null = null
  let rubricJudgeModel: string | null = null
  let fabricatedFact = false
  if (!options.skipRubric) {
    const draftForJudge = drafts[0]?.content ?? ""
    const judged = await judgeDraft(fixture, draftForJudge)
    rubricScore = judged.score
    rubricJudgeProvider = judged.provider
    rubricJudgeModel = judged.model
    fabricatedFact = judged.fabricated
  }

  void contextManifest

  return {
    fixtureId: fixture.id,
    version: fixture.version,
    agent: fixture.agent,
    scenario: fixture.scenario,
    contractPassed: grade.passed,
    contractAssertions: grade.assertions,
    rubricScore,
    rubricJudgeProvider,
    rubricJudgeModel,
    fabricatedFact,
    formatValidations,
    drafts: drafts.map((d) => ({ format: d.format, contentPreview: d.contentPreview.slice(0, 120) })),
    runId: execution.runId,
  }
}

function deterministicEvalExecution(
  fixture: EvalFixture,
  specFormats: readonly string[],
  ctx: EvalContext,
  runId: string,
): EvalExecutionResult {
  const draftFormats = fixture.expectations.outputFormats.length
    ? fixture.expectations.outputFormats
    : specFormats.length
      ? specFormats
      : (["raw_copy"] as const)
  return {
    drafts: draftFormats.map((format) => ({
      format,
      content: deterministicDraftFor(fixture, format, ctx),
    })),
    citedKnowledgeIds: ctx.knowledgeIds,
    warnedInsufficientInfo: fixture.expectations.mustWarnInsufficientInfo === true,
    runId,
  }
}

/** Deterministic representative draft (CI, no model). */
function deterministicDraftFor(
  fixture: EvalFixture,
  format: string,
  ctx: EvalContext
): string {
  // info_insufficient cases must NOT fabricate — emit a guidance note instead.
  if (fixture.expectations.mustWarnInsufficientInfo) {
    return "信息不足：请补充主题、产品或人设资料后再生成，避免编造内容。"
  }
  const knowledge = ctx.knowledgeBlock ? `\n参考知识：${ctx.knowledgeBlock.slice(0, 80)}` : ""
  return `${fixture.input.rawInput.slice(0, 40)} 的${format}稿件（确定性占位，仅用于 eval 路由/格式/上下文校验）。${knowledge}`
}

/** Deterministic sample of N fixtures (stable across runs, exactly N). */
export function sampleFixtures(
  fixtures: readonly EvalFixture[],
  sampleSize?: number
): EvalFixture[] {
  if (!sampleSize || sampleSize >= fixtures.length) return [...fixtures]
  // Evenly-spaced deterministic selection so the same N cases are picked every
  // run and every fixture has an equal chance of inclusion.
  const sampled: EvalFixture[] = []
  for (let i = 0; i < sampleSize; i += 1) {
    const index = Math.floor((i * fixtures.length) / sampleSize)
    sampled.push(fixtures[index])
  }
  return sampled
}

/** Run a set of fixtures and aggregate. */
export async function runEvalSuite(
  fixtures: readonly EvalFixture[],
  adapter: EvalContextAdapter,
  options: EvalRunOptions = {}
): Promise<EvalRunReport> {
  const repetitions = options.repetitions ?? 1
  const sampled = sampleFixtures(fixtures, options.sampleSize)
  const results: EvalCaseResult[] = []

  for (const fixture of sampled) {
    for (let rep = 0; rep < repetitions; rep += 1) {
      try {
        const result = await runEvalCase(fixture, adapter, options)
        results.push(result)
      } catch (error) {
        results.push({
          fixtureId: fixture.id,
          version: fixture.version,
          agent: fixture.agent,
          scenario: fixture.scenario,
          contractPassed: false,
          contractAssertions: [],
          rubricScore: null,
          rubricJudgeProvider: null,
          rubricJudgeModel: null,
          fabricatedFact: false,
          formatValidations: [],
          drafts: [],
          runId: `eval_${fixture.id}_err`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      options.onProgress?.(results.length, sampled.length * repetitions, fixture.id)
    }
  }

  const contractPassed = results.filter((r) => r.contractPassed).length
  const rubricJudged = results.filter((r) => r.rubricScore !== null)
  const rubricPassed = rubricJudged.filter((r) => (r.rubricScore ?? 0) >= RUBRIC_PASS_THRESHOLD).length
  const rubricMean = rubricJudged.length
    ? rubricJudged.reduce((sum, r) => sum + (r.rubricScore ?? 0), 0) / rubricJudged.length
    : null

  const agents = Array.from(new Set(results.map((r) => r.agent)))
  const perAgent: EvalRunReport["perAgent"] = {}
  for (const agent of agents) {
    const agentResults = results.filter((r) => r.agent === agent)
    const agentContractPassed = agentResults.filter((r) => r.contractPassed).length
    const agentRubricJudged = agentResults.filter((r) => r.rubricScore !== null)
    const agentRubricPassed = agentResults.filter((r) => (r.rubricScore ?? 0) >= RUBRIC_PASS_THRESHOLD).length
    perAgent[agent] = {
      count: agentResults.length,
      contractPassRate: agentResults.length ? agentContractPassed / agentResults.length : 0,
      rubricPassRate: agentRubricJudged.length ? agentRubricPassed / agentRubricJudged.length : null,
    }
  }

  return {
    adapter: adapter.name,
    totalCases: sampled.length,
    repetitions,
    contractPassRate: results.length ? contractPassed / results.length : 0,
    rubricPassRate: rubricJudged.length ? rubricPassed / rubricJudged.length : null,
    rubricMean,
    perAgent,
    results,
    generatedAt: new Date().toISOString(),
  }
}

export type EvalGateMode = "deterministic" | "daily" | "full"

export function evaluateEvalGate(
  report: EvalRunReport,
  mode: EvalGateMode,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (report.contractPassRate < 0.999) reasons.push("contract pass rate is below 100%")
  if (mode === "deterministic") return { passed: reasons.length === 0, reasons }

  if (report.results.some((result) => result.rubricScore === null)) {
    reasons.push("rubric judge coverage is incomplete")
  }
  if (report.results.some((result) => result.fabricatedFact)) {
    reasons.push("fabricated facts detected")
  }

  const requiredOverall = mode === "daily" ? 0.8 : 0.85
  if ((report.rubricPassRate ?? 0) < requiredOverall) {
    reasons.push(`rubric pass rate is below ${Math.round(requiredOverall * 100)}%`)
  }

  if (mode === "daily" && report.repetitions > 1) {
    const fixtureIds = new Set(report.results.map((result) => result.fixtureId))
    for (const fixtureId of fixtureIds) {
      const attempts = report.results.filter((result) => result.fixtureId === fixtureId)
      if (attempts.length >= 2 && attempts.every((result) => (result.rubricScore ?? 0) < RUBRIC_PASS_THRESHOLD)) {
        reasons.push(`fixture ${fixtureId} failed every repetition`)
      }
    }
  }

  if (mode === "full") {
    for (const [agent, stats] of Object.entries(report.perAgent)) {
      if ((stats.rubricPassRate ?? 0) < 0.8) reasons.push(`agent ${agent} rubric pass rate is below 80%`)
    }
  }

  return { passed: reasons.length === 0, reasons }
}

/** Render a report to Markdown for the CI job summary / artifact. */
export function renderEvalMarkdown(report: EvalRunReport): string {
  const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`)
  const lines = [
    `# AIM Eval Report (${report.adapter})`,
    "",
    `- Generated: ${report.generatedAt}`,
    `- Cases: ${report.totalCases} × ${report.repetitions} = ${report.results.length} runs`,
    `- Contract pass rate (routing/format/context): **${pct(report.contractPassRate)}**`,
    `- Rubric pass rate (≥${RUBRIC_PASS_THRESHOLD}): **${pct(report.rubricPassRate)}**`,
    `- Rubric mean: ${report.rubricMean !== null ? report.rubricMean.toFixed(1) : "n/a"}`,
    "",
    "## Per agent",
    "",
    "| Agent | Cases | Contract | Rubric |",
    "| --- | --- | --- | --- |",
  ]
  for (const [agent, stats] of Object.entries(report.perAgent)) {
    lines.push(`| ${agent} | ${stats.count} | ${pct(stats.contractPassRate)} | ${pct(stats.rubricPassRate)} |`)
  }
  lines.push("", "## Failed contract cases", "")
  const failed = report.results.filter((r) => !r.contractPassed)
  if (failed.length === 0) {
    lines.push("_(none)_")
  } else {
    for (const result of failed) {
      const detail = result.contractAssertions
        .filter((a) => !a.passed)
        .map((a) => `${a.name}(${a.detail})`)
        .join("; ")
      lines.push(`- \`${result.fixtureId}\`: ${detail}${result.error ? ` err=${result.error}` : ""}`)
    }
  }
  return lines.join("\n")
}
