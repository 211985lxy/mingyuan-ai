/**
 * AIM Thin Harness v1 — eval contracts.
 *
 * These types are the shared boundary between:
 *   - the versioned eval fixtures (pure data, no I/O)
 *   - the deterministic graders (no real model calls)
 *   - the production harness planner/composer/executor/validator (Phase 3)
 *
 * The fixtures are frozen inputs. The graders assert routing, output format and
 * context-usage *contracts* that the harness must satisfy for every case.
 *
 * IMPORTANT: fixtures must be deterministic and must NOT depend on a live
 * database or a real model. Anything external is expressed declaratively via
 * `seedContext` and `expectations`, so a frozen-context adapter can replay the
 * same case in CI without touching production.
 */

import type { ContentFormat, AimTaskType } from "@/lib/aim-generator"
import type { AimRuntimeTask, ResolvedKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"
import type { AimConversationMode } from "@/lib/aim-conversation-intent"
// AimAgentId / AimEntrypoint 的唯一事实源在 aim-harness/contracts.ts。
// eval 契约与生产 harness 必须共享同一身份定义，避免 fixture 与生产路由对
// "合法 agent id" 出现两套判定。
import type { AimAgentId, AimEntrypoint } from "../contracts"

// 类型仅为在 eval 契约中显式标注；唯一源在 ../contracts.ts。
export type { AimAgentId, AimEntrypoint }

/**
 * Scenarios the fixture suite must cover (plan §1):
 *   new            — 新稿 (write from scratch)
 *   imitate        — 仿写 (recreate a benchmark copy)
 *   partial_edit   — 局部修改 (polish a hook / ending)
 *   revision       — 追改纠偏 (follow-up correction / redirect)
 *   cite_knowledge — 知识引用 (must pull external knowledge into the prompt)
 *   info_insufficient — 信息不足 (should surface a warning, not fabricate)
 *   task_semantics — 任务语义契约 (90 天计划 0.2：创建/重写/轻改边界)
 */
export type EvalScenario =
  | "new"
  | "imitate"
  | "partial_edit"
  | "revision"
  | "cite_knowledge"
  | "info_insufficient"
  | "task_semantics"

/**
 * A single knowledge entry provided by the frozen-context adapter. This is the
 * shape the production knowledge context ranks against (see aim-knowledge-context.ts).
 */
export interface FrozenKnowledgeEntry {
  id: string
  title: string
  category: string
  /** value grade used by the knowledge ranker */
  valueGrade?: "S" | "A" | "B" | "C"
  /** snippet content; truncated the same way production truncates */
  content: string
}

/**
 * Frozen, deterministic context for a case. The DB adapter would populate the
 * same fields from the database; both adapters MUST yield identical planner
 * input so the rest of the pipeline (planner/composer/executor/validator) is
 * shared and replayable.
 */
export interface FrozenContext {
  knowledge: FrozenKnowledgeEntry[]
  /** IP Wiki positioning/methodology pages, already compiled to text */
  ipWikiBlock?: string
  /** competitor viral copy block, if the task references a benchmark */
  videoCopyBlock?: string
  /** market viral / hotspot block */
  marketViralBlock?: string
  /** conversation history for chat/revision cases */
  history?: Array<{ role: "user" | "assistant"; content: string }>
}

/**
 * Hard expectations the deterministic grader checks. These are the
 * "task routing, output format and context usage" hard assertions from the
 * acceptance criteria — 100% must pass on all 50 cases.
 */
export interface EvalExpectations {
  /** runtime task the planner MUST resolve for this input */
  runtimeTask: AimRuntimeTask
  /** knowledge strategy the planner MUST resolve (when asserted) */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  /** conversation mode the planner MUST resolve (chat/revision cases) */
  conversationMode?: AimConversationMode
  /** every requested format must appear in the output, no more no less */
  outputFormats: ContentFormat[]
  /** minimum knowledge entry ids that must be cited for cite_knowledge cases */
  mustCiteKnowledgeIds?: string[]
  /** for info_insufficient: the harness must emit a warning rather than fabricate */
  mustWarnInsufficientInfo?: boolean
  /** banned substrings that must never appear in any output */
  bannedSubstrings?: string[]
  /** minimum char length per format in the produced draft (sanity floor) */
  minCharsPerFormat?: number
}

/**
 * A versioned eval case. `version` lets us evolve a fixture without breaking
 * recorded baselines; the graders key assertions off (id, version).
 */
export interface EvalFixture {
  id: string
  version: number
  /** AIM agent exercised by this case. */
  agent: AimAgentId
  scenario: EvalScenario
  entrypoint: AimEntrypoint
  /** the raw request body, shaped exactly like parseGenerateBody input */
  input: EvalInput
  /** deterministic external context the frozen adapter supplies */
  seedContext: FrozenContext
  /** hard assertions the harness must satisfy */
  expectations: EvalExpectations
  /** short human description for reports */
  description: string
}

/**
 * Request input. Mirrors parseGenerateBody's parsed shape (the single source of
 * truth for the generate entrypoint) plus a chat-specific message field.
 */
export interface EvalInput {
  rawInput: string
  agentId?: AimAgentId
  projectId?: string
  taskType?: AimTaskType
  targetFormats?: ContentFormat[]
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  /** chat / revision cases carry the latest user turn here too */
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  /** inspiration entrypoint: the captured inspiration text */
  inspirationContent?: string
}
