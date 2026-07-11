/**
 * AIM Harness v2 — 统一上下文装配阶段（阶段 2.2）。
 *
 * prepareAimContext 把此前散落在 buildAimGeneration 内部的"装配"职责集中到一个
 * 函数：项目校验 → runtimeTask/生成意图/知识策略解析 → 并行加载背景 block →
 * TaskSpec 构建 → 压缩 → 上下文预算 → 产出 PreparedAimContext + 声明式来源清单。
 *
 * 关键约束：本函数必须与 buildAimGeneration 原装配逻辑逐字等价（同样的 gating、
 * 同样的 Promise.all 顺序、同样的 budget profile），否则会改变 prompt。阶段 2.3
 * 让 buildAimGeneration 改为调用 prepareAimContext 后，handler 不再自行装配。
 *
 * 注意：route 层的 rawInput 注入（buildRawInputWithVideoCopyContext 等）仍留在
 * route——它们改写的是"用户输入文本"，在 prepareAimContext 之前发生；阶段 2.8
 * 普通 generate 入口迁移时再决定是否下沉。
 */

import { prisma } from "@/lib/prisma"
import {
  resolveAimRuntimeTask,
  resolveKnowledgeStrategy,
  shouldUseKnowledgeContextForTask,
  type AimRuntimeTask,
  type ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
import { resolveAimConversationIntentWithRules } from "@/lib/aim-conversation-intent"
import { compressAimMessages } from "@/lib/aim-context-compressor"
import { applyAimContextBudget } from "@/lib/aim-context-budget"
import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"
import { buildBusinessDiagnosisMethodologyBlock } from "@/lib/business-diagnosis-methodology"
import {
  buildEventStorytellingMethodologyBlock,
  shouldUseEventStorytelling,
} from "@/lib/event-storytelling-methodology"
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import { buildIpWikiBlock } from "@/lib/ip-wiki/context"
import { buildViralStructureBlock } from "@/lib/aim-generator"
import { buildTaskSpecSkeleton } from "@/lib/task-spec"
import { refineTaskSpec } from "@/lib/task-spec-llm"
import {
  addAimTraceStep,
  runAimTraceStep,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import type { ContentScenario } from "@/lib/content-scenario-config"
import type { AimAgentId } from "./contracts"
import type { AimRunSpec, AimContextSource } from "./types"
import type { PreparedAimContext } from "./contracts"
import type { AimGenerationContextOverride } from "@/lib/aim-agent-handlers"

/** prepareAimContext 的入参：spec 之外、装配仍需的请求级字段。 */
export interface PrepareAimContextInput {
  spec: AimRunSpec
  /** 执行者 userId（隔离 + 知识查询） */
  userId: string
  /** trace recorder（与 buildAimGeneration 同源） */
  trace?: AimTraceRecorder
  /** 已授权重建的工作流 TaskSpec（route 层 buildWorkflowBrief 产出） */
  taskSpec?: import("@/lib/task-spec").TaskSpec
  /** 任务类型（透传 TaskSpec；runtimeTask 已由 planner 冻结，不再用于二次解析） */
  taskType?: import("@/lib/aim-generator").AimTaskType
  /** 局部润色指令（参与生成意图解析的 user 消息，与 buildAimGeneration:1470 一致） */
  polishInstruction?: string
  /** 选题流转 */
  topicSelectionId?: string
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  /** 视频拆解 id（驱动 shouldUseKnowledgeContextForTask 之外无直接影响，透传策略解析） */
  videoCopyExtractionId?: string
  /** 内容场景模式（驱动知识策略差异化） */
  contentScenario?: ContentScenario
  /** Eval-only：用冻结上下文替代 live DB 加载 */
  contextOverride?: AimGenerationContextOverride
}

/**
 * 装配上下文，产出 PreparedAimContext。
 *
 * 与 buildAimGeneration 的 step 1–4 逐字等价。返回的 blocks 已经过压缩 + 预算裁剪，
 * handler 直接消费，无需再处理。
 */
export async function prepareAimContext(
  input: PrepareAimContextInput,
): Promise<PreparedAimContext> {
  const { spec, trace } = input
  const agentId = spec.agentId as AimAgentId
  const params = input // alias for readability vs the original

  // 1. 项目校验（与 buildAimGeneration:1430 一致）
  await runAimTraceStep(trace, "project_check", "项目权限校验", async () => {
    if (!spec.projectId) return { checked: false }
    const project = await prisma.clientProject.findFirst({
      where: { id: spec.projectId, userId: params.userId, status: "active" },
      select: { id: true },
    })
    if (!project) throw new Error("客户项目不存在或已归档")
    return { checked: true }
  }, (result) => ({
    summary: result.checked ? "项目有效" : "无项目模式",
    metadata: result,
  }))

  // runtimeTask 已由 planner 冻结在 spec；这里直接采用，不二次解析
  // （buildAimGeneration 接受 params.runtimeTask 覆盖；v2 下 planner 是唯一源）。
  const runtimeTask = spec.runtimeTask as AimRuntimeTask

  // 生成意图（与 buildAimGeneration:1460 一致；仍需解析 useKnowledge/useMethodology）
  const generationIntent = await runAimTraceStep(
    trace,
    "resolve_generation_intent",
    "生成模式识别",
    async () =>
      resolveAimConversationIntentWithRules({
        agentId,
        messages: [
          {
            role: "user",
            content: [spec.rawInput, params.polishInstruction].filter(Boolean).join("\n"),
          },
        ],
      }).intent,
    (intent) => ({
      summary: intent.mode,
      metadata: { useKnowledge: intent.useKnowledge, useMethodology: intent.useMethodology },
    }),
  )

  // 2. 知识调用策略（与 buildAimGeneration:1484 一致）。
  // 注意：planner 冻结 spec.knowledgeStrategy 时未传入 contentScenario /
  // videoCopyExtractionId（route 当前不透传这两者给 harness plan），而 handler
  // 原实现会带入它们解析。为保持逐字等价，这里按完整参数重新解析——这与
  // buildAimGeneration 原行为一致。阶段 2 收尾时把 contentScenario/videoCopyExtractionId
  // 补进 PlanRunInput，让 planner 成为唯一源后，此处改回采用 spec.knowledgeStrategy。
  const knowledgeStrategy = resolveKnowledgeStrategy({
    runtimeTask,
    topicType: params.topicType,
    hotTopic: params.hotTopic,
    videoCopyExtractionId: params.videoCopyExtractionId,
    taskType: params.taskType as string | undefined,
    polishInstruction: params.polishInstruction,
    contentScenario: params.contentScenario,
  })

  // 3. 并行读取通用背景资产（与 buildAimGeneration:1508 一致，gating 逐字保留）
  const useEventStorytelling = shouldUseEventStorytelling({
    rawInput: spec.rawInput,
    topicTitle: params.topicTitle,
    topicType: params.topicType,
    topicRationale: params.topicRationale,
  })

  const [knowledgeCtx, viralStructureBlock, methodologyBlock, businessDiagnosisBlock, ipWikiBlock, eventStorytellingBlock] = await runAimTraceStep(
    trace,
    "load_generation_context",
    "知识/结构/方法论读取",
    () => params.contextOverride
      ? Promise.resolve([
          {
            knowledgeBlock: params.contextOverride!.knowledgeBlock,
            entries: params.contextOverride!.entries,
            source: params.contextOverride!.source,
          },
          params.contextOverride!.viralStructureBlock ?? "",
          params.contextOverride!.methodologyBlock ?? "",
          params.contextOverride!.businessDiagnosisBlock ?? "",
          params.contextOverride!.ipWikiBlock ?? "",
          params.contextOverride!.eventStorytellingBlock ?? "",
        ] as const)
      : Promise.all([
          spec.projectId && shouldUseKnowledgeContextForTask(runtimeTask)
            && generationIntent.useKnowledge
            ? buildAimKnowledgeContext({
                userId: params.userId,
                projectId: spec.projectId,
                agentId,
                query: spec.rawInput,
                topicTitle: params.topicTitle,
                topicRationale: params.topicRationale,
                strategy: knowledgeStrategy,
              })
            : Promise.resolve({ knowledgeBlock: "", entries: [], source: "raw" as const }),
          buildViralStructureBlock(),
          generationIntent.useMethodology ? buildIpCopywritingMethodologyBlock() : Promise.resolve(""),
          generationIntent.useMethodology && agentId === "business_system_diagnosis"
            ? buildBusinessDiagnosisMethodologyBlock()
            : Promise.resolve(""),
          generationIntent.useMethodology && spec.projectId ? buildIpWikiBlock({ projectId: spec.projectId }) : Promise.resolve(""),
          generationIntent.useMethodology && (agentId === "content_producer" || agentId === "deep_copywriter") && useEventStorytelling
            ? buildEventStorytellingMethodologyBlock()
            : Promise.resolve(""),
        ]),
    ([knowledge, viralStructure, methodology, businessDiagnosis, ipWiki, eventStory]) => ({
      summary: `命中 ${knowledge.entries.length} 条知识`,
      metadata: {
        knowledgeEntries: knowledge.entries.length,
        knowledgeSource: knowledge.source,
        viralStructureChars: viralStructure.length,
        methodologyChars: methodology.length,
        businessDiagnosisChars: businessDiagnosis.length,
        ipWikiChars: ipWiki.length,
        eventStorytellingChars: eventStory.length,
        eventStorytellingActive: useEventStorytelling,
      },
    }),
  )

  // ── TaskSpec 构建（与 buildAimGeneration:1568 一致，含二次查 project/topicSelection）
  const projectRow = spec.projectId
    ? await prisma.clientProject.findFirst({
        where: { id: spec.projectId, userId: params.userId },
        select: { name: true, targetCustomer: true, industry: true, offer: true, deliveryGoal: true },
      }).catch(() => null)
    : null
  const topicSelectionRow = params.topicSelectionId
    ? await prisma.topicSelection.findFirst({
        where: { id: params.topicSelectionId, userId: params.userId },
        select: { sourceHighlights: true, candidates: true },
      }).catch(() => null)
    : null
  const knowledgeTitles = (knowledgeCtx.entries ?? []).map((e: { title?: string }) => e.title).filter(Boolean) as string[]
  const taskSpecSkeleton = buildTaskSpecSkeleton({
    agentId,
    taskType: params.taskType,
    rawInput: spec.rawInput,
    project: projectRow ? {
      name: projectRow.name,
      targetCustomer: projectRow.targetCustomer,
      industry: projectRow.industry,
      offer: projectRow.offer,
      deliveryGoal: projectRow.deliveryGoal,
    } : null,
    topicSelection: topicSelectionRow ? {
      title: params.topicTitle,
      rationale: params.topicRationale,
      sourceHighlights: Array.isArray(topicSelectionRow.sourceHighlights) ? topicSelectionRow.sourceHighlights as any : [],
    } : null,
    knowledgeTitles,
  })
  const taskSpec = params.taskSpec || await refineTaskSpec(taskSpecSkeleton, { enabled: false })

  // 4. 压缩 + 上下文预算（与 buildAimGeneration:1607 一致）
  const generateMessages = [{ role: "user" as const, content: spec.rawInput }]
  const compressed = await runAimTraceStep(
    trace,
    "compress_generation_input",
    "生成输入压缩",
    () => compressAimMessages(agentId, generateMessages),
    (result) => ({
      summary: result.didCompress ? "已压缩输入" : "无需压缩",
      metadata: { didCompress: result.didCompress },
    }),
  )
  const knowledgeWithContext = compressed.didCompress
    ? `【对话摘要】\n${compressed.summary}\n\n${knowledgeCtx.knowledgeBlock}`
    : knowledgeCtx.knowledgeBlock
  const budgeted = applyAimContextBudget({
    conversationBlock: "",
    knowledgeBlock: knowledgeWithContext,
    methodologyBlock,
    businessDiagnosisBlock,
    viralStructureBlock,
    eventStorytellingBlock,
    ipWikiBlock,
  }, runtimeTask)
  await addAimTraceStep(trace, {
    key: "context_budget",
    label: "上下文预算",
    status: "success",
    summary: `${budgeted.stats.includedChars}/${budgeted.stats.budgetChars} 字`,
    metadata: budgeted.stats,
  })

  // 声明式来源清单（阶段 2.2 新增；此前 harness 事后反查，此处装配时即记录）
  const contextManifest = buildContextManifest(spec, knowledgeCtx.entries ?? [], budgeted.stats.includedChars)

  return {
    spec,
    rawInput: spec.rawInput,
    blocks: {
      knowledge: budgeted.blocks.knowledgeBlock,
      methodology: budgeted.blocks.methodologyBlock,
      businessDiagnosis: budgeted.blocks.businessDiagnosisBlock,
      viralStructure: budgeted.blocks.viralStructureBlock,
      eventStorytelling: budgeted.blocks.eventStorytellingBlock,
      ipWiki: budgeted.blocks.ipWikiBlock,
      // generate 路径此前不注入对话记忆；阶段 2 预留，暂为空
      memory: "",
    },
    taskSpec,
    retrievedEntries: (knowledgeCtx.entries ?? []).map((e: { id: string; title: string; category?: string }) => ({
      id: e.id,
      title: e.title,
      ...(e.category ? { category: e.category } : {}),
    })),
    retrievedSource: knowledgeCtx.source,
    contextManifest,
    budgetApplied: true,
  }
}

/** 装配阶段的声明式来源清单（取代 harness 事后反查）。 */
function buildContextManifest(
  spec: AimRunSpec,
  knowledgeEntries: Array<{ id: string }>,
  includedChars: number,
): AimContextSource[] {
  const sources: AimContextSource[] = []
  for (const entry of knowledgeEntries) {
    sources.push({
      kind: "knowledge",
      id: entry.id,
      charCount: includedChars,
    })
  }
  // request 来源（rawInput）始终记录，作为 contextHash 的稳定基线
  sources.push({
    kind: "request",
    id: "raw_input",
    charCount: spec.rawInput.length,
  })
  return sources
}

export { resolveAimRuntimeTask }
