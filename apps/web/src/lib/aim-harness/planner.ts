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
import type { ContentScenario } from "@/lib/content-scenario-config"

import type {
  AimAgentId,
  AimContextPolicy,
  AimEntrypoint,
  AimModelPolicy,
  AimModelPolicyOverride,
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
  videoCopyExtractionId?: string
  contentScenario?: ContentScenario
  /** chat/revision cases carry message history */
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  actorId?: string
  projectId?: string
  stream?: boolean
  runtimeTask?: AimRuntimeTask
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  conversationMode?: AimConversationMode
  agentModule?: "social" | "longform" | "free"
  writerModule?: "social" | "longform" | "free"
  modelPolicy?: AimModelPolicyOverride
}

function validateModelPolicyOverride(policy: AimModelPolicyOverride): void {
  if (!Number.isFinite(policy.temperature) || policy.temperature < 0 || policy.temperature > 2) {
    throw new Error("modelPolicy.temperature must be between 0 and 2")
  }
  if (!Number.isInteger(policy.maxTokens) || policy.maxTokens < 256 || policy.maxTokens > 16_384) {
    throw new Error("modelPolicy.maxTokens must be an integer between 256 and 16384")
  }
  if (!Number.isInteger(policy.maxProviderAttempts) || policy.maxProviderAttempts < 1 || policy.maxProviderAttempts > 3) {
    throw new Error("modelPolicy.maxProviderAttempts must be an integer between 1 and 3")
  }
}

function applyModelPolicyOverride(
  defaults: AimModelPolicy,
  override?: AimModelPolicyOverride,
): AimModelPolicy {
  if (!override) return Object.freeze({ ...defaults })
  validateModelPolicyOverride(override)
  return Object.freeze({
    ...defaults,
    temperature: override.temperature,
    maxTokens: override.maxTokens,
    maxProviderAttempts: override.maxProviderAttempts,
  })
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
 *   - 生成入口（executeGenerateLLM）：temperature 0.8，maxTokens 8192
 *     （推理模型如 gpt-5 会先消耗 reasoning tokens 再产出正文，4000 预算在复杂
 *     任务上会在产出正文前耗尽并返回空内容；与客户端默认上限 8192 对齐）
 * agent 维度目前无差异（所有 agent 共享上述按入口的默认值）；后续若按 agent
 * 差异化，从这里改即可，handler 执行函数改为读 spec.modelPolicy。
 */
function buildModelPolicy(
  agentId: AimAgentId,
  entrypoint: AimEntrypoint,
  stream: boolean,
  agentModule?: "social" | "longform" | "free",
  writerModule?: "social" | "longform" | "free",
): AimModelPolicy {
  const isChat = entrypoint === "chat"
  const module = agentModule ?? writerModule
  const needsAdvancedReasoning =
    agentId === "deep_copywriter" || agentId === "business_diagnosis"
  const requiresStandardFloor =
    needsAdvancedReasoning ||
    agentId === "business_system_diagnosis" ||
    agentId === "persona"

  // ── 温度差异化：自由创作高创意，深度创作低温度保准确 ──
  const temperature = isChat
    ? 0.7
    : module === "free" ? 0.92
    : module === "social" ? 0.85
    : agentId === "deep_copywriter" ? 0.72
    : 0.8

  // ── maxTokens 差异化：长文 12k，社交短文 4k，自由创作 6k ──
  const maxTokens = isChat
    ? undefined
    : module === "longform" || agentId === "deep_copywriter" ? 12288
    : module === "social" ? 4096
    : module === "free" ? 6144
    : 8192

  return {
    agentId,
    ...(module ? { routeKey: `copy_studio.${module}` } : {}),
    stream,
    temperature,
    ...(maxTokens ? { maxTokens } : {}),
    targetCapability: needsAdvancedReasoning ? "advanced" : "standard",
    minimumCapability: requiresStandardFloor ? "standard" : "basic",
    maxProviderAttempts: stream ? 2 : 3,
  }
}

/** Plan a run into an immutable AimRunSpec. Single source of truth for the run. */
/**
 * @description planaimrun
 * @param input - 输入数据
 * @returns AimRunSpec
 */
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
    videoCopyExtractionId: input.videoCopyExtractionId,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    contentScenario: input.contentScenario,
    copyStudioModule: input.agentModule ?? input.writerModule,
  })

  const contextPolicy = buildContextPolicy(input.agentId, input.entrypoint, runtimeTask, input.hotTopic)

  const defaults = buildModelPolicy(input.agentId, input.entrypoint, input.stream ?? false, input.agentModule, input.writerModule)
  const modelPolicy = applyModelPolicyOverride(defaults, input.modelPolicy)

  return Object.freeze({
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
  })
}
