/**
 * Registry of all versioned eval fixtures (66 cases).
 *
 *   content_producer  : 20
 *   deep_copywriter   : 15
 *   business_diagnosis: 15
 *   ─────────────────────
 *   remaining 4 agents: 16
 *   total             : 66
 */
import type { EvalFixture, EvalScenario } from "@/lib/aim-harness/eval/contracts"
import { CONTENT_PRODUCER_FIXTURES } from "./content-producer"
import { DEEP_COPYWRITER_FIXTURES } from "./deep-copywriter"
import { BUSINESS_DIAGNOSIS_FIXTURES } from "./business-diagnosis"
import { SUPPORTING_AGENT_FIXTURES } from "./supporting-agents"

export { CONTENT_PRODUCER_FIXTURES, DEEP_COPYWRITER_FIXTURES, BUSINESS_DIAGNOSIS_FIXTURES, SUPPORTING_AGENT_FIXTURES }

export const ALL_FIXTURES: EvalFixture[] = [
  ...CONTENT_PRODUCER_FIXTURES,
  ...DEEP_COPYWRITER_FIXTURES,
  ...BUSINESS_DIAGNOSIS_FIXTURES,
  ...SUPPORTING_AGENT_FIXTURES,
]

/** Fixtures for the three full-eval agents (Phase 5 will run these). */
export const FULL_EVAL_FIXTURES: EvalFixture[] = ALL_FIXTURES

/** Expected per-agent counts — asserted by the registry test. */
export const EXPECTED_AGENT_COUNTS = {
  content_producer: 20,
  deep_copywriter: 15,
  business_diagnosis: 15,
  free_copywriter: 4,
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
]
