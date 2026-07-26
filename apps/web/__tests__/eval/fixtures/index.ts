/**
 * Registry of all versioned eval fixtures (92 cases).
 *
 *   content_producer  : 45  (24 + 21 prompt_quality)
 *   work_editor   : 15
 *   business_diagnosis: 15
 *   free_copywriter   : 5   (4 + 1 prompt_quality)
 *   remaining 3 agents: 12
 *   total             : 92
 */
import type { EvalFixture, EvalScenario } from "@/lib/aim-harness/eval/contracts"
import { CONTENT_PRODUCER_FIXTURES } from "./content-producer"
import { WORK_EDITOR_FIXTURES } from "./work-editor"
import { BUSINESS_DIAGNOSIS_FIXTURES } from "./business-diagnosis"
import { SUPPORTING_AGENT_FIXTURES } from "./supporting-agents"
import { PROMPT_QUALITY_FIXTURES } from "./prompt-quality"

export {
  CONTENT_PRODUCER_FIXTURES,
  WORK_EDITOR_FIXTURES,
  BUSINESS_DIAGNOSIS_FIXTURES,
  SUPPORTING_AGENT_FIXTURES,
  PROMPT_QUALITY_FIXTURES,
}

export const ALL_FIXTURES: EvalFixture[] = [
  ...CONTENT_PRODUCER_FIXTURES,
  ...WORK_EDITOR_FIXTURES,
  ...BUSINESS_DIAGNOSIS_FIXTURES,
  ...SUPPORTING_AGENT_FIXTURES,
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
  persona: 4,
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
