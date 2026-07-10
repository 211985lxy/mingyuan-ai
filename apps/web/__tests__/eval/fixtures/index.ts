/**
 * Registry of all versioned eval fixtures (50 cases).
 *
 *   content_producer  : 20
 *   deep_copywriter   : 15
 *   business_diagnosis: 15
 *   ─────────────────────
 *   total             : 50
 */
import type { EvalFixture, EvalScenario } from "@/lib/aim-harness/eval/contracts"
import { CONTENT_PRODUCER_FIXTURES } from "./content-producer"
import { DEEP_COPYWRITER_FIXTURES } from "./deep-copywriter"
import { BUSINESS_DIAGNOSIS_FIXTURES } from "./business-diagnosis"

export { CONTENT_PRODUCER_FIXTURES, DEEP_COPYWRITER_FIXTURES, BUSINESS_DIAGNOSIS_FIXTURES }

export const ALL_FIXTURES: EvalFixture[] = [
  ...CONTENT_PRODUCER_FIXTURES,
  ...DEEP_COPYWRITER_FIXTURES,
  ...BUSINESS_DIAGNOSIS_FIXTURES,
]

/** Fixtures for the three full-eval agents (Phase 5 will run these). */
export const FULL_EVAL_FIXTURES: EvalFixture[] = ALL_FIXTURES

/** Expected per-agent counts — asserted by the registry test. */
export const EXPECTED_AGENT_COUNTS = {
  content_producer: 20,
  deep_copywriter: 15,
  business_diagnosis: 15,
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
