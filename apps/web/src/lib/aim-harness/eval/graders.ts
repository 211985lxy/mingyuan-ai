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
import { formatLabelForTaskSpec, inferContentFormatsFromRawInput } from "@/lib/aim-format-inference"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"
import {
  buildTaskSpecSkeleton,
  enrichTaskSpecFromRawInput,
} from "@/lib/task-spec"

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
  /** optional final prompt text for TaskSpec / grounding assertions */
  promptText?: string
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
/**
 * @description referenceruntimetask
 * @param fixture - fixture
 * @returns 无返回值
 */
export function referenceRuntimeTask(fixture: EvalFixture) {
  const { input } = fixture
  const targetFormats = input.targetFormats?.length
    ? input.targetFormats
    : inferContentFormatsFromRawInput(input.rawInput)
  return resolveAimRuntimeTask({
    agentId: input.agentId,
    input: input.rawInput,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    targetFormats,
  })
}

/** 为 prompt_quality 断言构建与生产一致的任务单渲染文本 */
function referenceWorkflowPrompt(fixture: EvalFixture): string {
  const skeleton = buildTaskSpecSkeleton({
    agentId: fixture.input.agentId,
    taskType: fixture.input.taskType,
    rawInput: fixture.input.rawInput,
    project: null,
    topicSelection: fixture.input.topicTitle
      ? { title: fixture.input.topicTitle, rationale: fixture.input.topicRationale }
      : null,
    knowledgeTitles: fixture.seedContext.knowledge.map((k) => k.title),
  })
  const inferred = inferContentFormatsFromRawInput(fixture.input.rawInput)
  const taskSpec = enrichTaskSpecFromRawInput(skeleton, fixture.input.rawInput, {
    outputFormatHint: inferred[0] ? formatLabelForTaskSpec(inferred[0]) : undefined,
  })
  // 把 seed known facts 并入渲染，模拟档案注入
  if (fixture.seedContext.knowledge.length) {
    taskSpec.knownFacts = [
      ...taskSpec.knownFacts,
      ...fixture.seedContext.knowledge.slice(0, 4).map((k) => ({
        statement: k.content.slice(0, 80),
        source: k.title,
      })),
    ]
  }
  const workflow = buildWorkflowContext({
    taskSpec,
    rawInput: fixture.input.rawInput,
    runtimeTask: fixture.expectations.runtimeTask,
    targetFormats: fixture.input.targetFormats ?? fixture.expectations.outputFormats,
    topicTitle: fixture.input.topicTitle,
    topicRationale: fixture.input.topicRationale,
    hotTopic: fixture.input.hotTopic,
    polishInstruction: fixture.input.polishInstruction,
  })
  return [workflow, fixture.seedContext.ipWikiBlock || ""].filter(Boolean).join("\n\n")
}

/**
 * Reference knowledge strategy. Note resolveKnowledgeStrategy needs the
 * runtimeTask first, so this composes the two planner steps in order.
 */
/**
 * @description referenceknowledgestrategy
 * @param fixture - fixture
 * @returns 无返回值
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
/**
 * @description frozenknowledgeids
 * @param ctx - 上下文
 * @returns string[]
 */
export function frozenKnowledgeIds(ctx: FrozenContext): string[] {
  return ctx.knowledge.map((entry: FrozenKnowledgeEntry) => entry.id)
}

/**
 * Run every deterministic assertion for a fixture. `run` carries what the
 * harness produced (or, for the planner-only checks, undefined to assert the
 * contract independent of any model output).
 */
/**
 * @description gradefixture
 * @param graderInput - grader输入数据
 * @returns GraderResult
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

  // 7. prompt_quality — TaskSpec fields must appear in rendered workflow prompt
  if (fixture.expectations.mustIncludeTaskSpecFields?.length) {
    const prompt = graderInput.promptText ?? referenceWorkflowPrompt(fixture)
    const missing = fixture.expectations.mustIncludeTaskSpecFields.filter(
      (field) => !prompt.includes(field),
    )
    assertions.push({
      name: "taskspec_fields_in_prompt",
      passed: missing.length === 0,
      detail: missing.length ? `missing=[${missing.join(",")}]` : "ok",
    })
  }

  // 8. prompt_quality — seed facts / IP anchors must be present in prompt or draft
  if (fixture.expectations.mustGroundInSeedFacts?.length) {
    const corpus = [
      graderInput.promptText ?? referenceWorkflowPrompt(fixture),
      graderInput.draftText ?? "",
      fixture.seedContext.ipWikiBlock ?? "",
      ...fixture.seedContext.knowledge.map((k) => `${k.title}\n${k.content}`),
    ].join("\n")
    const missing = fixture.expectations.mustGroundInSeedFacts.filter(
      (fact) => !corpus.includes(fact),
    )
    assertions.push({
      name: "ground_in_seed_facts",
      passed: missing.length === 0,
      detail: missing.length ? `missing=[${missing.join(",")}]` : "ok",
    })
  }

  // 9. prompt_quality — output scope (opening_only vs full_draft)
  if (fixture.expectations.maxScope === "opening_only" && graderInput.draftText) {
    const draft = graderInput.draftText
    const tooLong = draft.length > 400
    const looksFull = /===FORMAT:|正文|完整成稿/.test(draft) && draft.length > 200
    assertions.push({
      name: "max_scope_opening_only",
      passed: !tooLong && !looksFull,
      detail: `chars=${draft.length} looksFull=${looksFull}`,
    })
  }

  return {
    fixtureId: fixture.id,
    version: fixture.version,
    assertions,
    passed: assertions.every((assertion) => assertion.passed),
  }
}
