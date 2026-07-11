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
import type { AimRuntimeTask, ResolvedKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"
import type { AimConversationMode } from "@/lib/aim-conversation-intent"

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
  runtimeTask?: AimRuntimeTask
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  conversationMode?: AimConversationMode
}

/**
 * Build the context policy from the resolved task + agent + entrypoint.
 *
 * 阶段 2.1：此前 agentId / hotTopic 被 void 掉（policy 只按 runtimeTask 派生），
 * 现在真正用上，使 policy 与 handler 实际加载行为对齐（阶段 2.2 prepareAimContext
 * 接管装配后，本 policy 成为加载决策的唯一依据）。
 *
 * 当前 policy 仍未被生产装配消费（handlers 自行加载），故本变更对运行时无影响；
 * modelPolicy 的填充才是阶段 2.1 真正影响模型行为的部分。
 */
function buildContextPolicy(
  agentId: AimAgentId,
  entrypoint: AimEntrypoint,
  runtimeTask: string,
  hotTopic?: string
): AimContextPolicy {
  const loadKnowledge = runtimeTask !== "light_edit"

  // market viral：新稿/定位策划类任务加载；有显式热榜（hotTopic）时也加载。
  const loadMarketViral =
    runtimeTask === "new_copy" || runtimeTask === "positioning_topic" || Boolean(hotTopic)

  // IP Wiki：定位策划官（business_diagnosis）依赖已编译定位底盘，必载；
  // 其它任务在定位/新稿/仿写场景机会性加载（与 handler 行为一致）。
  const loadIpWiki =
    agentId === "business_diagnosis" ||
    runtimeTask === "positioning_topic" ||
    runtimeTask === "new_copy" ||
    runtimeTask === "rewrite_copy"

  // 竞品监控仅 chat 入口加载。
  const loadCompetitorWatch = entrypoint === "chat"

  return {
    loadKnowledge,
    loadIpWiki,
    loadMarketViral,
    loadCompetitorWatch,
  }
}

/**
 * 冻结模型参数。阶段 2.1：把此前由 handler 执行函数硬编码的 temperature/maxTokens
 * 上移到 planner，使 modelPolicy 成为模型参数唯一事实源。
 *
 * 必须与 handler 现有执行函数逐字一致（否则改变模型行为）：
 *   - chat 入口（executeChatLLM/Stream）：temperature 0.7，无 maxTokens
 *   - 生成入口（executeGenerateLLM）：temperature 0.8，maxTokens 4000
 * agent 维度目前无差异（所有 agent 共享上述按入口的默认值）；后续若按 agent
 * 差异化，从这里改即可，handler 执行函数改为读 spec.modelPolicy。
 */
function buildModelPolicy(
  agentId: AimAgentId,
  entrypoint: AimEntrypoint,
  stream: boolean
): AimModelPolicy {
  const isChat = entrypoint === "chat"
  return {
    agentId,
    stream,
    temperature: isChat ? 0.7 : 0.8,
    ...(isChat ? {} : { maxTokens: 4000 }),
  }
}

/** Plan a run into an immutable AimRunSpec. Single source of truth for the run. */
export function planAimRun(input: PlanRunInput): AimRunSpec {
  const runtimeTask = input.runtimeTask ?? resolveAimRuntimeTask({
    agentId: input.agentId,
    input: input.rawInput,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    targetFormats: input.targetFormats,
  })

  const conversationMode = input.conversationMode ?? resolveAimConversationIntentWithRules({
      agentId: input.agentId,
      messages: input.messages ?? [{ role: "user", content: input.rawInput }],
    }).intent.mode

  const knowledgeStrategy = input.knowledgeStrategy ?? resolveKnowledgeStrategy({
    runtimeTask,
    topicType: input.topicType,
    hotTopic: input.hotTopic,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
  })

  const contextPolicy = buildContextPolicy(input.agentId, input.entrypoint, runtimeTask, input.hotTopic)

  const modelPolicy = buildModelPolicy(input.agentId, input.entrypoint, input.stream ?? false)

  return {
    entrypoint: input.entrypoint,
    agentId: input.agentId,
    runtimeTask,
    conversationMode,
    knowledgeStrategy,
    outputFormats: input.targetFormats,
    contextPolicy,
    modelPolicy,
    rawInput: input.rawInput,
    actorId: input.actorId,
    projectId: input.projectId,
  }
}
