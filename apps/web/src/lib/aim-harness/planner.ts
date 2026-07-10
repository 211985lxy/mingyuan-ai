/**
 * AIM Thin Harness v1 — planner.
 *
 * Parses the run ONCE into an immutable AimRunSpec:
 *   1. normalize entrypoint / agentId / request
 *   2. resolve runtime task, conversation mode, knowledge strategy
 *
 * The same pure functions the domain handlers use (resolveAimRuntimeTask,
 * resolveAimConversationIntentWithRules, resolveKnowledgeStrategy) are called
 * here so the harness spec and the handler internals agree. The resolved
 * runtimeTask is passed back into buildAimGeneration (which short-circuits its
 * own resolution), guaranteeing a single source of truth and zero re-resolution.
 */

import { resolveAimRuntimeTask, resolveKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"
import { resolveAimConversationIntentWithRules } from "@/lib/aim-conversation-intent"
import type { ContentFormat } from "@/lib/aim-generator"

import type {
  AimAgentId,
  AimContextPolicy,
  AimEntrypoint,
  AimModelPolicy,
  AimRunSpec,
} from "./types"

export interface PlanRunInput {
  entrypoint: AimEntrypoint
  agentId: AimAgentId
  rawInput: string
  targetFormats: ContentFormat[]
  taskType?: string
  polishInstruction?: string
  topicType?: string
  hotTopic?: string
  /** chat/revision cases carry message history */
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  actorId?: string
  projectId?: string
  stream?: boolean
}

/** Build the context policy from the resolved task (mirrors the handler gates). */
function buildContextPolicy(
  agentId: AimAgentId,
  entrypoint: AimEntrypoint,
  runtimeTask: string,
  hotTopic?: string
): AimContextPolicy {
  const loadKnowledge = runtimeTask !== "light_edit"
  const loadMarketViral = runtimeTask === "new_copy" || runtimeTask === "positioning_topic"
  // business_diagnosis lives on compiled IP Wiki; others load it opportunistically.
  const loadIpWiki =
    runtimeTask === "positioning_topic" || runtimeTask === "new_copy" || runtimeTask === "rewrite_copy"
  const loadCompetitorWatch = entrypoint === "chat"
  void agentId
  void hotTopic
  return {
    loadKnowledge,
    loadIpWiki,
    loadMarketViral,
    loadCompetitorWatch,
  }
}

/** Plan a run into an immutable AimRunSpec. Single source of truth for the run. */
export function planAimRun(input: PlanRunInput): AimRunSpec {
  const runtimeTask = resolveAimRuntimeTask({
    agentId: input.agentId,
    input: input.rawInput,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    targetFormats: input.targetFormats,
  })

  const conversationIntent = resolveAimConversationIntentWithRules({
    agentId: input.agentId,
    messages: input.messages ?? [{ role: "user", content: input.rawInput }],
  })

  const knowledgeStrategy = resolveKnowledgeStrategy({
    runtimeTask,
    topicType: input.topicType,
    hotTopic: input.hotTopic,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
  })

  const contextPolicy = buildContextPolicy(input.agentId, input.entrypoint, runtimeTask, input.hotTopic)

  const modelPolicy: AimModelPolicy = {
    agentId: input.agentId,
    stream: input.stream ?? false,
  }

  return {
    entrypoint: input.entrypoint,
    agentId: input.agentId,
    runtimeTask,
    conversationMode: conversationIntent.intent.mode,
    knowledgeStrategy,
    outputFormats: input.targetFormats,
    contextPolicy,
    modelPolicy,
    rawInput: input.rawInput,
    actorId: input.actorId,
    projectId: input.projectId,
  }
}
