/**
 * AIM Thin Harness v1 — run contracts.
 *
 * The harness normalizes every AIM call into an immutable AimRunSpec, executes
 * it through the existing domain handlers (buildAimGeneration /
 * buildAimChatResponse — kept intact, NOT reimplemented), and records
 * AimRunMetadata (the runId + provider/model/fallback/degraded the acceptance
 * criteria require on every call).
 *
 * The four entrypoints (chat / generate / agent_api / inspiration) become thin
 * adapters that build an AimRunSpec and hand it to runAimHarness().
 */

import type { ContentFormat } from "@/lib/aim-generator"
import type {
  AimRuntimeTask,
  ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
import type { AimConversationMode } from "@/lib/aim-conversation-intent"

export const HARNESS_VERSION = "aim-harness-v1" as const

export type AimEntrypoint = "chat" | "generate" | "agent_api" | "inspiration"

export type AimAgentId =
  | "content_producer"
  | "free_copywriter"
  | "deep_copywriter"
  | "business_system_diagnosis"
  | "business_diagnosis"
  | "content_review"
  | "persona"

/** Context policy: how aggressively to load external context for this run. */
export interface AimContextPolicy {
  /** whether to load knowledge (RAG) context */
  loadKnowledge: boolean
  /** whether to load IP Wiki positioning/methodology */
  loadIpWiki: boolean
  /** whether to load market viral / hotspot context */
  loadMarketViral: boolean
  /** whether to load competitor watch context (chat only) */
  loadCompetitorWatch: boolean
}

/** Model policy: routing + fallback behavior. */
export interface AimModelPolicy {
  agentId: AimAgentId
  /** whether streaming is requested */
  stream: boolean
  /** temperature override (optional; handlers keep their defaults otherwise) */
  temperature?: number
  /** max tokens override (optional) */
  maxTokens?: number
}

/** A single context source loaded for the run, for the manifest + hash. */
export interface AimContextSource {
  kind: "knowledge" | "ip_wiki" | "methodology" | "market_viral" | "competitor_watch" | "video_copy" | "memory" | "history"
  /** source id (knowledge entry id, wiki page id, …) or stable label */
  id: string
  /** when the source was last updated (ISO), if known */
  updatedAt?: string
  /** character count of the block contributed */
  charCount: number
}

/** The immutable, normalized run plan. Built once; the rest of the run reads it. */
export interface AimRunSpec {
  entrypoint: AimEntrypoint
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
  conversationMode?: AimConversationMode
  knowledgeStrategy: ResolvedKnowledgeStrategy
  outputFormats: ContentFormat[]
  contextPolicy: AimContextPolicy
  modelPolicy: AimModelPolicy
  /** the raw user input that drove the run, for the snapshot */
  rawInput: string
  /** stable label identifying the actor (user id / api key id) */
  actorId?: string
  projectId?: string
}

/** Per-run metadata captured during execution (the acceptance-criteria payload). */
export interface AimRunMetadata {
  runId: string
  harnessVersion: typeof HARNESS_VERSION
  /** actual provider that produced the result (may differ from requested) */
  provider: string
  model: string
  /** 0 = first (preferred) provider succeeded; >0 means fallback happened */
  fallbackIndex: number
  /** true if a provider failed and the run still delivered via a later provider */
  degraded: boolean
  /** SHA-256 of the final composed prompt */
  promptHash: string
  /** SHA-256 of the context manifest */
  contextHash: string
  /** every provider attempt observed (success + failure) */
  providerAttempts: Array<{
    provider: string
    model?: string
    status: "success" | "failed"
    error?: string
    errorKind?: string
    durationMs?: number
    attemptIndex: number
    responseModel?: string
    totalTokens?: number
  }>
}

/** Result of running the harness for a generation. */
export interface AimHarnessResult {
  metadata: AimRunMetadata
  /** the output as produced by the domain handlers, returned verbatim */
  output: unknown
  /** context manifest used to build the prompt */
  contextManifest: AimContextSource[]
  /** the final composed prompt text (admin-only, persisted in snapshot) */
  composedPrompt: string
}
