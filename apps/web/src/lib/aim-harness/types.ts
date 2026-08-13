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
import type { AimAgentId, AimEntrypoint } from "./contracts"
import type { ModelCapability } from "@/lib/llm/types"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"

export const HARNESS_VERSION = "aim-harness-v1" as const

// AimAgentId / AimEntrypoint 的唯一事实源在 ./contracts.ts，这里仅 re-export
// 以保持现有 import 路径（@/lib/aim-harness/types）向后兼容。
export type { AimAgentId, AimEntrypoint }

/**
 * Harness 执行模式（14 周正本阶段 1/3）。
 * - single_shot：默认；Planner 冻结后一次/少数次生成（现有路径）
 * - bounded_tool_loop：有界 ReAct；须命中 allowlist，否则 planner 拒绝
 */
export type AimExecutionMode = "single_shot" | "bounded_tool_loop"

export const AIM_EXECUTION_MODES: readonly AimExecutionMode[] = [
  "single_shot",
  "bounded_tool_loop",
] as const

/** 冻结的执行策略（正本契约；未传时解析为 single_shot）。 */
export interface AimExecutionPolicy {
  mode: AimExecutionMode
  allowedToolNames: string[]
  maxSteps: number
  timeoutMs: number
  maxAutoRetries: number
}

/** 上下文源信任级别（正本阶段 2/5）。 */
export type AimContextTrustLevel =
  | "system_trusted"
  | "user_provided"
  | "external_untrusted"

export type AimRunStopReason =
  | "completed"
  | "max_steps"
  | "timeout"
  | "token_budget_exceeded"
  | "tool_unauthorized"
  | "tool_failed"
  | "insufficient_evidence"
  | "human_required"
  | "validation_failed"
  | "model_degraded"
  | "single_shot"

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

export type AimModelCapability = ModelCapability

/** Model policy: routing + fallback behavior. */
export interface AimModelPolicy {
  agentId: AimAgentId
  routeKey?: string
  /** whether streaming is requested */
  stream: boolean
  /** temperature override (optional; handlers keep their defaults otherwise) */
  temperature?: number
  /** max tokens override (optional) */
  maxTokens?: number
  /** preferred capability for the task */
  targetCapability: AimModelCapability
  /** hard floor: routes below this capability must not be used silently */
  minimumCapability: AimModelCapability
  /** per-run provider budget; streaming uses a smaller budget */
  maxProviderAttempts: number
}

export type AimModelPolicyOverride = Readonly<Required<Pick<
  AimModelPolicy,
  "temperature" | "maxTokens" | "maxProviderAttempts"
>>>

/** A single context source loaded for the run, for the manifest + hash. */
export interface AimContextSource {
  kind: "request" | "knowledge" | "ip_wiki" | "methodology" | "market_viral" | "competitor_watch" | "video_copy" | "memory" | "history" | "workflow_brief" | "skill" | "system"
  /** source id (knowledge entry id, wiki page id, …) or stable label */
  id: string
  /** when the source was last updated (ISO), if known */
  updatedAt?: string
  /** character count of the block contributed */
  charCount: number
  /** SHA-256 of the actual source content used for this run. */
  contentHash?: string
  /** 信任级别；缺省按 kind 推断，外部/群聊/工具结果必须显式标 external_untrusted */
  trustLevel?: AimContextTrustLevel
  /** 可选来源引用（URL、消息 id、工具名等），供引用追踪 */
  sourceRef?: string
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
  /**
   * draft-only: do NOT persist a generation record (agent_api 外部交付约定)。
   * 升级阶段 1.2：此前散落在 adapter 入参里，现在并入冻结的 spec，使"是否落库"
   * 与其它决策一样由 planner 一次确定、下游不再二次判断。
   */
  draftOnly?: boolean
  /**
   * 是否对主稿跑 LLM 质检（只读、不回写）。各入口是否关闭由
   * llm-quality-policy.ts 的 resolveLlmQuality(scenario) 统一决策。
   * 升级阶段 1.2：并入冻结 spec，统一质检开关的事实源。
   */
  runLlmQuality?: boolean
  /**
   * 用户/前端显式选择的命名方法论 profile id（ADR-002）。纯输入快照，由 planner
   * 直接冻结；解析（命中 published 版本）在 prepareAimContext 阶段完成，解析结果
   * 通过 methodologyPolicy 冻结。未传或功能开关关闭时为空。
   */
  methodologyProfileIds?: string[]
  /**
   * 解析后的命名方法论策略（profile + published 版本）。由装配阶段产出并通过
   * withSpecOverrides 并入冻结 spec，使 snapshot 同时记录输入选择与命中版本，
   * 保证历史可重放、可追溯。planner 本身不解析（保持纯同步）。
   */
  methodologyPolicy?: AimMethodologyPolicy
  /**
   * @deprecated 过渡字段，等于 executionPolicy.mode；新代码读 executionPolicy。
   */
  executionMode: AimExecutionMode
  /** 冻结执行策略；未传入口一律 single_shot。 */
  executionPolicy: AimExecutionPolicy
  unifiedContentExecution?: { envelope: AimContentSourceEnvelope; brief: string }
}

/** 冻结后的命名方法论策略（ADR-002）。 */
export interface AimMethodologyPolicy {
  source: "explicit_parameter" | "explicit_text" | "none"
  selections: Array<{
    profileId: string
    versionId: string
    version: number
    mode: "primary"
    reason: string
  }>
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
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  costCny?: number
  /** every provider attempt observed (success + failure) */
  providerAttempts: Array<{
    provider: string
    model?: string
    capability?: AimModelCapability
    status: "success" | "failed"
    error?: string
    errorKind?: string
    durationMs?: number
    attemptIndex: number
    responseModel?: string
    totalTokens?: number
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
  }>
  /** Tool Loop / 运行停止原因（SingleShot 默认为 single_shot） */
  stopReason?: AimRunStopReason
  toolStepCount?: number
  toolFailureCount?: number
  humanHandoff?: boolean
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
