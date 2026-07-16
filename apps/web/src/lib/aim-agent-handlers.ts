import { getAimGenerationUsage } from "@/lib/aim-harness/persistence"
import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"
import { buildBusinessDiagnosisMethodologyBlock } from "@/lib/business-diagnosis-methodology"
import { fireKnowledgeEmbedding } from "@/lib/aim-knowledge-context"
import { compressAimMessages } from "@/lib/aim-context-compressor"
import { applyAimContextBudget } from "@/lib/aim-context-budget"
import { buildIpWikiBlock } from "@/lib/ip-wiki/context"
import {
  addAimTraceStep,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
} from "@/lib/aim-observability"
import {
  buildConversationIntentBlock,
  resolveAimConversationIntentWithRules,
} from "@/lib/aim-conversation-intent"
import {
  AIM_AGENT_IDS,
  DEFAULT_AIM_AGENT,
  LEGACY_AGENT_ID_ALIASES,
  type AimAgentId,
} from "@/lib/aim-harness/contracts"
import { planAimRun } from "@/lib/aim-harness/planner"
import { prepareAimContext } from "@/lib/aim-harness/context-assembly"
import { ContentProducerHandler } from "@/lib/aim-agent-content-producer"
import { FreeCopywriterHandler } from "@/lib/aim-agent-free-copywriter"
import { DeepCopywriterHandler } from "@/lib/aim-agent-deep-copywriter"
import { BusinessSystemDiagnosisHandler } from "@/lib/aim-agent-business-system-diagnosis"
import { BusinessDiagnosisHandler } from "@/lib/aim-agent-business-diagnosis"
import { ContentReviewHandler } from "@/lib/aim-agent-content-review"
import { PersonaHandler } from "@/lib/aim-agent-persona"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "@/lib/aim/agent-types"

export type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerationContextOverride,
  AimGenerateResponse,
} from "@/lib/aim/agent-types"
export type { AimAgentId }
export {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
  buildContentProducerChatPrompt,
  buildXhsVisualDirectorInstruction,
} from "@/lib/aim-agent-prompts"
export {
  buildContentReviewChatPrompt,
  buildContentReviewGeneratePrompt,
} from "@/lib/aim-agent-content-review"
export { detectPersonaMode } from "@/lib/aim-agent-persona"
export {
  benchmarkCopyReuseRatio,
  extractBenchmarkOriginalCopy,
  isBenchmarkCopyTooSimilar,
} from "@/lib/aim-benchmark-quality"

const HANDLERS: Record<AimAgentId, AimAgentHandler> = {
  content_producer: new ContentProducerHandler(),
  free_copywriter: new FreeCopywriterHandler(),
  deep_copywriter: new DeepCopywriterHandler(),
  business_system_diagnosis: new BusinessSystemDiagnosisHandler(),
  business_diagnosis: new BusinessDiagnosisHandler(),
  content_review: new ContentReviewHandler(),
  persona: new PersonaHandler(),
}

const VALID_AGENT_IDS = AIM_AGENT_IDS as ReadonlySet<string>

export function getAgentHandler(agentId: string): AimAgentHandler {
  if (VALID_AGENT_IDS.has(agentId)) {
    return HANDLERS[agentId as AimAgentId]
  }

  const aliased = LEGACY_AGENT_ID_ALIASES[agentId]
  if (aliased && VALID_AGENT_IDS.has(aliased)) {
    return HANDLERS[aliased]
  }

  return HANDLERS[DEFAULT_AIM_AGENT]
}

type AimChatRuntimeInput = Omit<
  AimChatParams,
  "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock"
>

async function buildAimChatRuntime(
  agentId: string,
  params: AimChatRuntimeInput,
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
      params.conversationIntent?.useMethodology === false
        ? Promise.resolve("")
        : buildIpCopywritingMethodologyBlock(),
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
  params: AimChatRuntimeInput,
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
  params: AimChatRuntimeInput,
): AsyncIterable<string> {
  const runtime = await buildAimChatRuntime(agentId, params)
  yield* runtime.handler.streamChat(runtime.params)
}

type AimGenerationInput = Omit<
  AimGenerateContext,
  | "agentId"
  | "knowledgeBlock"
  | "methodologyBlock"
  | "businessDiagnosisBlock"
  | "viralStructureBlock"
  | "eventStorytellingBlock"
  | "ipWikiBlock"
  | "retrievedEntries"
  | "retrievedSource"
  | "knowledgeStrategy"
>

function buildGenerationRunSpec(agentId: string, params: AimGenerationInput) {
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

  return params.runSpec ?? (params.runtimeTask
    ? { ...plannedSpec, runtimeTask: params.runtimeTask }
    : plannedSpec)
}

function resolveGenerationConversationMode(agentId: string, params: AimGenerationInput) {
  return resolveAimConversationIntentWithRules({
    agentId,
    messages: [{
      role: "user",
      content: [params.rawInput, params.polishInstruction].filter(Boolean).join("\n"),
    }],
  }).intent.mode
}

async function finishGenerationRun(
  params: AimGenerationInput,
  response: AimGenerateResponse,
  retrievedEntries: any[],
  retrievedSource: string,
) {
  if (!params.skipPersistence) {
    await addAimTraceStep(params.trace, {
      key: "fire_knowledge_embedding",
      label: "知识向量补写",
      status: "success",
      summary: "已触发后台补写",
      metadata: { entries: retrievedEntries.length },
    })
    fireKnowledgeEmbedding(retrievedEntries, retrievedSource)
  }

  const saved = params.skipPersistence ? null : await getAimGenerationUsage(response.id)
  await finishAimTrace(params.trace, {
    aimGenerationId: response.id,
    model: saved?.model || null,
    totalTokens: saved?.totalTokens || null,
    outputSummary: summarizeText(response.results.map((item) => item.content).join("\n\n")),
  })
}

export async function buildAimGeneration(
  agentId: string,
  params: AimGenerationInput,
): Promise<AimGenerateResponse> {
  const handler = getAgentHandler(agentId)
  const spec = buildGenerationRunSpec(agentId, params)
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
  const generationMode = resolveGenerationConversationMode(agentId, params)
  const response = await runAimTraceStep(
    params.trace,
    "agent_generate",
    "智能体生成并保存",
    () => handler.generate({
      ...params,
      agentId,
      runtimeTask: prepared.spec.runtimeTask,
      modelPolicy: prepared.spec.modelPolicy,
      knowledgeBlock: prepared.blocks.knowledge,
      methodologyBlock: prepared.blocks.methodology,
      businessDiagnosisBlock: prepared.blocks.businessDiagnosis,
      viralStructureBlock: prepared.blocks.viralStructure,
      eventStorytellingBlock: prepared.blocks.eventStorytelling,
      ipWikiBlock: prepared.blocks.ipWiki,
      retrievedEntries: (prepared.retrievedEntries ?? []) as any[],
      retrievedSource: prepared.retrievedSource ?? "raw",
      knowledgeStrategy: prepared.spec.knowledgeStrategy,
      taskSpec: prepared.taskSpec,
    }),
    (result) => ({
      summary: `生成 ${result.results.length} 个交付物`,
      outputSummary: summarizeText(result.results.map((item) => `${item.format}: ${item.content}`).join("\n")),
      metadata: { resultId: result.id, formats: result.results.map((item) => item.format) },
    }),
  )

  await finishGenerationRun(
    params,
    response,
    (prepared.retrievedEntries ?? []) as any[],
    prepared.retrievedSource ?? "raw",
  )

  return {
    ...response,
    conversationMode: generationMode,
    knowledgeStrategy: prepared.spec.knowledgeStrategy,
    taskSpec: prepared.taskSpec,
  }
}
