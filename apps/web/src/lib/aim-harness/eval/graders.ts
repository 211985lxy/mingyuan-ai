/**
 * AIM Thin Harness v1 — deterministic baseline graders.
 *
 * These graders encode the *contracts* the harness must satisfy, using the real
 * production pure functions as the authoritative reference:
 *   - resolveAimRuntimeTask  (planner routing)
 *   - resolveKnowledgeStrategy (knowledge policy)
 *
 * They never call a model and never touch a database. The same grader logic is
 * reused by the Phase 5 eval harness (frozen + DB adapters share the planner),
 * so a fixture that passes here will pass under the DB adapter as long as the
 * adapters agree on planner input.
 *
 * Quality of the *draft text* (LLM score, banned-word detection, AI-taste) is
 * graded separately at runtime; these graders cover the deterministic layer:
 * routing, format and context usage.
 */

import {
  resolveAimRuntimeTask,
  resolveKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"

import type { ContentFormat } from "@/lib/aim-generator"

import type {
  EvalFixture,
  FrozenContext,
  FrozenKnowledgeEntry,
} from "./contracts"

/** The set of formats the agent_api contract considers valid output. */
export const GRADABLE_FORMATS: ReadonlySet<ContentFormat> = new Set([
  "video_script",
  "wechat_article",
  "moments_post",
  "community_message",
  "shooting_brief",
  "raw_copy",
  "koubo_script",
  "xiaohongshu_post",
])

export interface GraderInput {
  fixture: EvalFixture
  /** formats actually present in the produced draft, in order */
  producedFormats?: ContentFormat[]
  /** knowledge entry ids the run cited in its draft / knowledgeUsed */
  citedKnowledgeIds?: string[]
  /** whether the run emitted an insufficient-info warning */
  warnedInsufficientInfo?: boolean
  /** the draft text concatenated for banned-substring checks */
  draftText?: string
}

export interface GraderAssertion {
  name: string
  passed: boolean
  detail?: string
}

export interface GraderResult {
  fixtureId: string
  version: number
  assertions: GraderAssertion[]
  passed: boolean
}

/**
 * Reference planner: resolve the runtime task exactly as production does.
 * Exposed so the Phase 5 harness planner wraps it and the DB adapter shares it.
 */
export function referenceRuntimeTask(fixture: EvalFixture) {
  const { input } = fixture
  return resolveAimRuntimeTask({
    agentId: input.agentId,
    input: input.rawInput,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    targetFormats: input.targetFormats,
  })
}

/**
 * Reference knowledge strategy. Note resolveKnowledgeStrategy needs the
 * runtimeTask first, so this composes the two planner steps in order.
 */
export function referenceKnowledgeStrategy(fixture: EvalFixture) {
  const { input } = fixture
  const runtimeTask = referenceRuntimeTask(fixture)
  return resolveKnowledgeStrategy({
    runtimeTask,
    topicType: input.topicType,
    hotTopic: input.hotTopic,
    videoCopyExtractionId: undefined,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
  })
}

/** All knowledge ids the frozen adapter would surface for this case. */
export function frozenKnowledgeIds(ctx: FrozenContext): string[] {
  return ctx.knowledge.map((entry: FrozenKnowledgeEntry) => entry.id)
}

/**
 * Run every deterministic assertion for a fixture. `run` carries what the
 * harness produced (or, for the planner-only checks, undefined to assert the
 * contract independent of any model output).
 */
export function gradeFixture(graderInput: GraderInput): GraderResult {
  const { fixture } = graderInput
  const assertions: GraderAssertion[] = []

  // 1. Runtime task routing — the planner MUST resolve this task.
  const actualTask = referenceRuntimeTask(fixture)
  assertions.push({
    name: "runtime_task",
    passed: actualTask === fixture.expectations.runtimeTask,
    detail: `expected=${fixture.expectations.runtimeTask} actual=${actualTask}`,
  })

  // 2. Knowledge strategy (when the fixture asserts one).
  if (fixture.expectations.knowledgeStrategy) {
    const actualStrategy = referenceKnowledgeStrategy(fixture)
    assertions.push({
      name: "knowledge_strategy",
      passed: actualStrategy === fixture.expectations.knowledgeStrategy,
      detail: `expected=${fixture.expectations.knowledgeStrategy} actual=${actualStrategy}`,
    })
  }

  // 3. Output format contract — produced formats must equal the expected set.
  if (graderInput.producedFormats && fixture.expectations.outputFormats.length > 0) {
    const expected = [...fixture.expectations.outputFormats].sort().join(",")
    const produced = [...graderInput.producedFormats].sort().join(",")
    const allValid = graderInput.producedFormats.every((format) =>
      GRADABLE_FORMATS.has(format)
    )
    assertions.push({
      name: "output_formats_exact",
      passed: produced === expected && allValid,
      detail: `expected=[${expected}] produced=[${produced}] valid=${allValid}`,
    })
  }

  // 4. Context usage — cite_knowledge cases must reference seeded knowledge.
  if (fixture.expectations.mustCiteKnowledgeIds?.length) {
    const cited = new Set(graderInput.citedKnowledgeIds ?? [])
    const missing = fixture.expectations.mustCiteKnowledgeIds.filter(
      (id) => !cited.has(id)
    )
    assertions.push({
      name: "cite_knowledge",
      passed: missing.length === 0,
      detail: missing.length ? `missing cited ids=[${missing.join(",")}]` : "ok",
    })
  }

  // 5. info_insufficient — must warn, must not fabricate.
  if (fixture.expectations.mustWarnInsufficientInfo) {
    assertions.push({
      name: "warn_insufficient_info",
      passed: graderInput.warnedInsufficientInfo === true,
      detail: `warned=${graderInput.warnedInsufficientInfo ?? false}`,
    })
  }

  // 6. Banned substrings — must never appear in any output.
  if (fixture.expectations.bannedSubstrings?.length) {
    const text = graderInput.draftText ?? ""
    const hit = fixture.expectations.bannedSubstrings.filter((sub) =>
      text.includes(sub)
    )
    assertions.push({
      name: "no_banned_substrings",
      passed: hit.length === 0,
      detail: hit.length ? `hit=[${hit.join(",")}]` : "ok",
    })
  }

  return {
    fixtureId: fixture.id,
    version: fixture.version,
    assertions,
    passed: assertions.every((assertion) => assertion.passed),
  }
}
