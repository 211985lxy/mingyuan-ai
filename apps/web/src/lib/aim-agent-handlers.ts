import type { AimModelPolicy } from "@/lib/aim-harness/types"
import { getAimGenerationUsage } from "@/lib/aim-harness/persistence"
import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"
import { buildBusinessDiagnosisMethodologyBlock } from "@/lib/business-diagnosis-methodology"
import { fireKnowledgeEmbedding } from "@/lib/aim-knowledge-context"
import {
  type ResolvedKnowledgeStrategy,
  type AimRuntimeTask,
} from "@/lib/aim-knowledge-strategy"
import { compressAimMessages } from "@/lib/aim-context-compressor"
import { applyAimContextBudget } from "@/lib/aim-context-budget"
import { buildIpWikiBlock } from "@/lib/ip-wiki/context"
import {
  ContentFormat,
  AimTaskType,
} from "./aim-generator"
import {
  addAimTraceStep,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { type ContentScenario } from "@/lib/content-scenario-config"
export {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
  buildXhsVisualDirectorInstruction,
} from "@/lib/aim-agent-prompts"
import {
  benchmarkCopyReuseRatio,
  extractBenchmarkOriginalCopy,
  isBenchmarkCopyTooSimilar,
} from "@/lib/aim-benchmark-quality"
import {
  buildConversationIntentBlock,
  resolveAimConversationIntentWithRules,
  type AimConversationMode,
  type AimConversationIntent,
} from "@/lib/aim-conversation-intent"
// 身份契约唯一源：AimAgentId / 运行时校验 / 别名归一化统一来自这里。
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import {
  AIM_AGENT_IDS,
  LEGACY_AGENT_ID_ALIASES,
  DEFAULT_AIM_AGENT,
} from "@/lib/aim-harness/contracts"
// 阶段 2.3：装配下沉。buildAimGeneration 改为 plan + prepareAimContext + handler.generate。
// 注意：这是过渡态——阶段 2.4 executeAimRun 接管编排后，buildAimGeneration 将只接收
// PreparedAimContext，不再反向依赖 harness 模块（届时移除这两行 import）。
import { planAimRun } from "@/lib/aim-harness/planner"
import { prepareAimContext } from "@/lib/aim-harness/context-assembly"
import { ContentProducerHandler } from "@/lib/aim-agent-content-producer"
import { FreeCopywriterHandler } from "@/lib/aim-agent-free-copywriter"
import { DeepCopywriterHandler } from "@/lib/aim-agent-deep-copywriter"
import { BusinessSystemDiagnosisHandler } from "@/lib/aim-agent-business-system-diagnosis"
import { BusinessDiagnosisHandler } from "@/lib/aim-agent-business-diagnosis"
import {
  ContentReviewHandler,
  buildContentReviewChatPrompt,
  buildContentReviewGeneratePrompt,
} from "@/lib/aim-agent-content-review"
import { PersonaHandler, detectPersonaMode } from "@/lib/aim-agent-persona"

export { buildContentReviewChatPrompt, buildContentReviewGeneratePrompt }
export { detectPersonaMode }
export { buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"

// ─── 类型定义 ──────────────────────────────────────────────

// AimAgentId 的唯一事实源在 @/lib/aim-harness/contracts，这里 re-export 以
// 保持现有从 aim-agent-handlers 引入该类型的调用方兼容。
export type { AimAgentId }
export { benchmarkCopyReuseRatio, extractBenchmarkOriginalCopy, isBenchmarkCopyTooSimilar }

export interface AimChatParams {
  userId: string
  projectId?: string
  messages: any[]
  knowledgeBlock: string
  conversationBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  conversationIntent?: AimConversationIntent
  runtimeTask?: AimRuntimeTask
  modelPolicy?: AimModelPolicy
  trace?: AimTraceRecorder
}

export interface AimChatResponse {
  content: string
}

export interface AimGenerateContext {
  userId: string
  agentId: string
  projectId?: string
  rawInput: string
  targetFormats: ContentFormat[]
  taskType?: AimTaskType
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  videoCopyExtractionId?: string
  existingGenerationId?: string
  topicSelectionId?: string
  selectedTopicIndex?: number
  taskSpec?: import("@/lib/task-spec").TaskSpec
  runtimeTask?: AimRuntimeTask
  modelPolicy?: AimModelPolicy
  runSpec?: import("@/lib/aim-harness/types").AimRunSpec

  // 共享数据上下文
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  /** 事件内容化方法论（现场/事件复盘类专用，非该类内容时为空串） */
  eventStorytellingBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  retrievedEntries: any[]
  retrievedSource: string
  /** 本次实际生效的知识调用策略（解析后回传，供 UI 反馈） */
  knowledgeStrategy: ResolvedKnowledgeStrategy
  /** 内容场景模式（由前端或路由层传入，驱动提示块和知识策略差异化） */
  contentScenario?: ContentScenario
  trace?: AimTraceRecorder
  /** Eval-only: use frozen context instead of live DB loaders. */
  contextOverride?: AimGenerationContextOverride
  /** Eval-only: execute the production prompt/model path without writing history. */
  skipPersistence?: boolean
}

export interface AimGenerationContextOverride {
  knowledgeBlock: string
  entries: Array<{
    id: string
    title: string
    content: string
    category: string
    tags: unknown
    valueGrade: string | null
    score: number
  }>
  source: "embedding" | "raw"
  viralStructureBlock?: string
  methodologyBlock?: string
  businessDiagnosisBlock?: string
  ipWikiBlock?: string
  eventStorytellingBlock?: string
}

export interface AimGenerateResponse {
  id: string
  results: Array<{
    format: ContentFormat
    content: string
    wordCount: number
  }>
  knowledgeUsed: Array<{
    id: string
    title: string
    category: string
  }>
  conversationMode?: AimConversationMode
  /** 本次实际生效的知识调用策略（由 buildAimGeneration 解析后注入，供 UI 反馈） */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  /** 协作认知层产物：风险/模式/事实/缺口/假设（由 buildAimGeneration 注入） */
  taskSpec?: import("@/lib/task-spec").TaskSpec
}

export interface AimAgentHandler {
  agentId: AimAgentId
  chat(params: AimChatParams): Promise<AimChatResponse>
  streamChat(params: AimChatParams): AsyncIterable<string>
  generate(context: AimGenerateContext): Promise<AimGenerateResponse>
}

// ─── 调度与分流器 ───────────────────────────────────────────

const HANDLERS: Record<AimAgentId, AimAgentHandler> = {
  content_producer: new ContentProducerHandler(),
  free_copywriter: new FreeCopywriterHandler(),
  deep_copywriter: new DeepCopywriterHandler(),
  business_system_diagnosis: new BusinessSystemDiagnosisHandler(),
  business_diagnosis: new BusinessDiagnosisHandler(),
  content_review: new ContentReviewHandler(),
  persona: new PersonaHandler(),
}

// VALID_AGENT_IDS / 别名映射统一引用 @/lib/aim-harness/contracts，避免与
// AimAgentId 字面量出现第三份事实源。
const VALID_AGENT_IDS = AIM_AGENT_IDS as ReadonlySet<string>
const AGENT_ID_ALIASES = LEGACY_AGENT_ID_ALIASES

export function getAgentHandler(agentId: string): AimAgentHandler {
  // 1. 直接命中
  if (VALID_AGENT_IDS.has(agentId)) {
    return HANDLERS[agentId as AimAgentId]
  }
  // 2. 尝试别名映射
  const aliased = AGENT_ID_ALIASES[agentId]
  if (aliased && VALID_AGENT_IDS.has(aliased)) {
    return HANDLERS[aliased]
  }
  // 3. 回退到默认 handler
  return HANDLERS[DEFAULT_AIM_AGENT]
}

/**
 * 统一 chat 处理入口
 */
async function buildAimChatRuntime(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">
): Promise<{ handler: AimAgentHandler; params: AimChatParams }> {
  const compressed = await runAimTraceStep(
    params.trace,
    "compress_messages",
    "上下文压缩",
    () => compressAimMessages(agentId, params.messages),
    (result) => ({
      summary: result.didCompress ? "已压缩长对话" : "无需压缩",
      metadata: { messageCount: params.messages.length, didCompress: result.didCompress },
    }),
  )
  const enrichedKnowledgeBlock = compressed.didCompress
    ? `【对话摘要】\n${compressed.summary}\n\n${params.knowledgeBlock}`
    : params.knowledgeBlock
  const conversationBlock = params.conversationIntent
    ? buildConversationIntentBlock(params.conversationIntent)
    : ""

  const [methodologyBlock, businessDiagnosisBlock, ipWikiBlock] = await runAimTraceStep(
    params.trace,
    "build_runtime_context",
    "方法论/IP Wiki 上下文",
    () => Promise.all([
      params.conversationIntent?.useMethodology === false ? Promise.resolve("") : buildIpCopywritingMethodologyBlock(),
      params.conversationIntent?.useMethodology === false || agentId !== "business_system_diagnosis"
        ? Promise.resolve("")
        : buildBusinessDiagnosisMethodologyBlock(),
      params.conversationIntent?.useMethodology === false || !params.projectId
        ? Promise.resolve("")
        : buildIpWikiBlock({ projectId: params.projectId }),
    ]),
    ([methodology, businessDiagnosis, ipWiki]) => ({
      summary: "运行上下文已构建",
      metadata: {
        methodologyChars: methodology.length,
        businessDiagnosisChars: businessDiagnosis.length,
        ipWikiChars: ipWiki.length,
      },
    }),
  )
  const budgeted = applyAimContextBudget({
    conversationBlock,
    knowledgeBlock: enrichedKnowledgeBlock,
    methodologyBlock,
    businessDiagnosisBlock,
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock,
  }, params.runtimeTask ?? "rewrite_copy")
  await addAimTraceStep(params.trace, {
    key: "context_budget",
    label: "上下文预算",
    status: "success",
    summary: `${budgeted.stats.includedChars}/${budgeted.stats.budgetChars} 字`,
    metadata: budgeted.stats,
  })

  return {
    handler: getAgentHandler(agentId),
    params: {
      ...params,
      conversationBlock: budgeted.blocks.conversationBlock,
      knowledgeBlock: budgeted.blocks.knowledgeBlock,
      methodologyBlock: budgeted.blocks.methodologyBlock,
      businessDiagnosisBlock: budgeted.blocks.businessDiagnosisBlock,
      ipWikiBlock: budgeted.blocks.ipWikiBlock,
    },
  }
}

export async function buildAimChatResponse(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">,
): Promise<AimChatResponse> {
  const runtime = await buildAimChatRuntime(agentId, params)
  return runAimTraceStep(
    params.trace,
    "llm_chat",
    "LLM 聊天生成",
    () => runtime.handler.chat(runtime.params),
    (result) => ({ outputSummary: summarizeText(result.content) }),
  )
}

export async function* buildAimChatResponseStream(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">
): AsyncIterable<string> {
  const runtime = await buildAimChatRuntime(agentId, params)
  yield* runtime.handler.streamChat(runtime.params)
}

/**
 * 统一 generate 处理入口
 */
export async function buildAimGeneration(agentId: string, params: Omit<AimGenerateContext, "agentId" | "knowledgeBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "viralStructureBlock" | "eventStorytellingBlock" | "ipWikiBlock" | "retrievedEntries" | "retrievedSource" | "knowledgeStrategy">): Promise<AimGenerateResponse> {
  const handler = getAgentHandler(agentId)

  // ── 阶段 2.3：装配下沉到 prepareAimContext（统一上下文装配阶段）──
  // 此前的 step1-4（项目校验 / runtimeTask·生成意图·知识策略解析 / Promise.all
  // 背景 block 加载 / TaskSpec 构建 / 压缩 / 上下文预算）已集中到 prepareAimContext，
  // 与原实现逐字等价。buildAimGeneration 现在只做：装配 → handler.generate → 收尾。
  const plannedSpec = planAimRun({
    entrypoint: "generate",
    agentId: agentId as AimAgentId,
    rawInput: params.rawInput,
    targetFormats: params.targetFormats,
    taskType: params.taskType,
    polishInstruction: params.polishInstruction,
    topicType: params.topicType,
    hotTopic: params.hotTopic,
    actorId: params.userId,
    projectId: params.projectId,
  })
  // route 可能已解析 runtimeTask（与 planner 同源函数，结果应一致）；若有差异，
  // 采用 route 值以保持向后兼容（原 buildAimGeneration 行为：params.runtimeTask 优先）。
  const spec = params.runSpec ?? (params.runtimeTask
    ? { ...plannedSpec, runtimeTask: params.runtimeTask }
    : plannedSpec)

  const prepared = await prepareAimContext({
    spec,
    userId: params.userId,
    trace: params.trace,
    taskType: params.taskType,
    polishInstruction: params.polishInstruction,
    taskSpec: params.taskSpec,
    topicSelectionId: params.topicSelectionId,
    topicTitle: params.topicTitle,
    topicRationale: params.topicRationale,
    topicType: params.topicType,
    hotTopic: params.hotTopic,
    videoCopyExtractionId: params.videoCopyExtractionId,
    contentScenario: params.contentScenario,
    contextOverride: params.contextOverride,
  })

  const runtimeTask = prepared.spec.runtimeTask
  const knowledgeStrategy = prepared.spec.knowledgeStrategy
  // 生成意图 mode（供响应回传；与原 buildAimGeneration 末尾的 conversationMode 一致）
  const generationMode = resolveAimConversationIntentWithRules({
    agentId,
    messages: [{ role: "user", content: [params.rawInput, params.polishInstruction].filter(Boolean).join("\n") }],
  }).intent.mode

  // 5. 调用具体的智能体 Handler（接收已装配的 prepared blocks）
  const response = await runAimTraceStep(params.trace, "agent_generate", "智能体生成并保存", () => handler.generate({
    ...params,
    agentId,
    runtimeTask,
    modelPolicy: prepared.spec.modelPolicy,
    knowledgeBlock: prepared.blocks.knowledge,
    methodologyBlock: prepared.blocks.methodology,
    businessDiagnosisBlock: prepared.blocks.businessDiagnosis,
    viralStructureBlock: prepared.blocks.viralStructure,
    eventStorytellingBlock: prepared.blocks.eventStorytelling,
    ipWikiBlock: prepared.blocks.ipWiki,
    retrievedEntries: (prepared.retrievedEntries ?? []) as any[],
    retrievedSource: prepared.retrievedSource ?? "raw",
    knowledgeStrategy,
    taskSpec: prepared.taskSpec,
  }), (result) => ({
    summary: `生成 ${result.results.length} 个交付物`,
    outputSummary: summarizeText(result.results.map((item) => `${item.format}: ${item.content}`).join("\n")),
    metadata: { resultId: result.id, formats: result.results.map((item) => item.format) },
  }))

  // 6. 后续处理 (Fire-and-forget 向量写入)
  if (!params.skipPersistence) {
    await addAimTraceStep(params.trace, {
      key: "fire_knowledge_embedding",
      label: "知识向量补写",
      status: "success",
      summary: "已触发后台补写",
      metadata: { entries: (prepared.retrievedEntries ?? []).length },
    })
    fireKnowledgeEmbedding((prepared.retrievedEntries ?? []) as any[], prepared.retrievedSource ?? "raw")
  }

  const saved = params.skipPersistence
    ? null
    : await getAimGenerationUsage(response.id)
  await finishAimTrace(params.trace, {
    aimGenerationId: response.id,
    model: saved?.model || null,
    totalTokens: saved?.totalTokens || null,
    outputSummary: summarizeText(response.results.map((item) => item.content).join("\n\n")),
  })

  return { ...response, conversationMode: generationMode, knowledgeStrategy, taskSpec: prepared.taskSpec }
}

// ─── 共享辅助函数 ───────────────────────────────────────────
