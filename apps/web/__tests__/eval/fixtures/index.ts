/**
 * Registry of all versioned eval fixtures (92 cases).
 *
 *   content_producer  : 45  (24 + 21 prompt_quality)
 *   work_editor       : 15  (润色/排版/图文/局部改/追改；深度长文新写已归 content_producer)
 *   business_diagnosis: 15
 *   free_copywriter   : 5   (4 + 1 prompt_quality)
 *   content_retro     : 4   (复盘边界：缺数据不编造、不越界写稿)
 *   remaining 2 agents: 8
 *   total             : 92
 */
import type { EvalFixture, EvalScenario } from "@/lib/aim-harness/eval/contracts"
import { CONTENT_PRODUCER_FIXTURES } from "./content-producer"
import { WORK_EDITOR_FIXTURES } from "./work-editor"
import { BUSINESS_DIAGNOSIS_FIXTURES } from "./business-diagnosis"
import { SUPPORTING_AGENT_FIXTURES } from "./supporting-agents"
import { CONTENT_RETRO_FIXTURES } from "./content-retro"
import { PROMPT_QUALITY_FIXTURES } from "./prompt-quality"

export {
  CONTENT_PRODUCER_FIXTURES,
  WORK_EDITOR_FIXTURES,
  BUSINESS_DIAGNOSIS_FIXTURES,
  SUPPORTING_AGENT_FIXTURES,
  CONTENT_RETRO_FIXTURES,
  PROMPT_QUALITY_FIXTURES,
}

export const ALL_FIXTURES: EvalFixture[] = [
  ...CONTENT_PRODUCER_FIXTURES,
  ...WORK_EDITOR_FIXTURES,
  ...BUSINESS_DIAGNOSIS_FIXTURES,
  ...SUPPORTING_AGENT_FIXTURES,
  ...CONTENT_RETRO_FIXTURES,
  ...PROMPT_QUALITY_FIXTURES,
]

/** Fixtures for the three full-eval agents (Phase 5 will run these). */
export const FULL_EVAL_FIXTURES: EvalFixture[] = ALL_FIXTURES

/** Expected per-agent counts — asserted by the registry test. */
export const EXPECTED_AGENT_COUNTS = {
  content_producer: 45,
  work_editor: 15,
  business_diagnosis: 15,
  free_copywriter: 5,
  business_system_diagnosis: 4,
  content_review: 4,
  content_retro: 4,
} as const

/** Expected per-scenario counts across the full suite. */
export const EXPECTED_SCENARIO_COVERAGE: EvalScenario[] = [
  "new",
  "imitate",
  "partial_edit",
  "revision",
  "cite_knowledge",
  "info_insufficient",
  "task_semantics",
  "prompt_quality",
]
