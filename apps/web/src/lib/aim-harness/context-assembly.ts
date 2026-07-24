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
  type AimRuntimeTask,
  type ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
import { compressAimMessages } from "@/lib/aim-context-compressor"
import { applyAimContextBudget } from "@/lib/aim-context-budget"
import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"
import { buildBusinessDiagnosisMethodologyBlock } from "@/lib/business-diagnosis-methodology"
import {
  buildEventStorytellingMethodologyBlock,
  shouldUseEventStorytelling,
} from "@/lib/event-storytelling-methodology"
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import {
  enrichKnowledgeQueryWithPainIntent,
  mergePainIntentIntoKnowledgeContext,
  resolvePainPointIntent,
} from "@/lib/aim-pain-intent"
import { buildIpWikiBlock } from "@/lib/ip-wiki/context"
import { buildViralStructureBlock } from "@/lib/aim-generator"
import { buildTaskSpecSkeleton, enrichTaskSpecFromRawInput } from "@/lib/task-spec"
import { refineTaskSpec } from "@/lib/task-spec-llm"
import { formatLabelForTaskSpec, inferContentFormatsFromRawInput } from "@/lib/aim-format-inference"
import {
  addAimTraceStep,
  runAimTraceStep,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import type { ContentScenario } from "@/lib/content-scenario-config"
import type { AimAgentId } from "./contracts"
import type { AimRunSpec, AimContextSource, AimMethodologyPolicy } from "./types"
import type { PreparedAimContext } from "./contracts"
import type { AimGenerationContextOverride } from "@/lib/aim-agent-handlers"
import { AIM_FACT_PRIORITY_VERSION, withAimFactPriorityRule } from "@/lib/aim-context-priority"
import { sha256 } from "./hashing"
import { buildContextManifest } from "./context-manifest"
import {
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
  type MethodologyPolicy,
} from "@/lib/methodology-profile-store"
import { runBoundedToolLoop } from "./tool-loop"
import { sanitizeUntrustedContextText } from "./context-trust"
import { buildAimSkillBlock, loadAimSkills } from "./skill-loader"
import { env } from "@/env"

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
  /** ADR-002：显式选择的命名方法论 profile id（解析在装配阶段完成）。 */
  methodologyProfileIds?: string[]
  /** 高稳路由/TaskSpec LLM 精化开关（默认开；eval 可关） */
  stableRouting?: boolean
}

/**
 * 装配上下文，产出 PreparedAimContext。
 *
 * 与 buildAimGeneration 的 step 1–4 逐字等价。返回的 blocks 已经过压缩 + 预算裁剪，
 * handler 直接消费，无需再处理。
 */
/**
 * @description prepareaimcontext
 * @param input - 输入数据
 * @returns Promise<PreparedAimContext>
 */
export async function prepareAimContext(
  input: PrepareAimContextInput,
): Promise<PreparedAimContext> {
  const { spec, trace } = input
  const agentId = spec.agentId as AimAgentId
  const params = input // alias for readability vs the original

  // 1. 项目校验 + 生成意图（与 buildAimGeneration:1430 / 1460 一致）
  const generationIntent = await checkProjectAndResolveIntent({ spec, agentId, params, trace })

  // runtimeTask 已由 planner 冻结在 spec；这里直接采用，不二次解析
  // （buildAimGeneration 接受 params.runtimeTask 覆盖；v2 下 planner 是唯一源）。
  const runtimeTask = spec.runtimeTask as AimRuntimeTask

  // 2. 知识调用策略只读 planner 军结结果，不再二次解析。
  const knowledgeStrategy = spec.knowledgeStrategy

  // 3. 并行读取通用背景资产（与 buildAimGeneration:1508 一致，gating 逐字保留）
  const {
    knowledgeCtx, viralStructureBlock, methodologyBlock,
    businessDiagnosisBlock, ipWikiBlock, eventStorytellingBlock,
  } = await loadGenerationContextBlocks({ spec, params, agentId, knowledgeStrategy, generationIntent, trace })

  // 3.2 有界工具环：先查再写（仅 executionPolicy.mode=bounded_tool_loop；eval override 跳过）
  let knowledgeBlock = knowledgeCtx.knowledgeBlock
  if (spec.executionPolicy.mode === "bounded_tool_loop" && !params.contextOverride) {
    const loopResult = await runAimTraceStep(
      trace,
      "bounded_tool_loop",
      "有界检索",
      () =>
        runBoundedToolLoop({
          agentId,
          runtimeTask,
          rawInput: spec.rawInput,
          userId: params.userId,
          projectId: spec.projectId,
          maxSteps: spec.executionPolicy.maxSteps,
          timeoutMs: spec.executionPolicy.timeoutMs,
        }),
      (result) => ({
        summary: result.stopReason,
        metadata: {
          steps: result.steps.length,
          stopReason: result.stopReason,
          toolStepCount: result.steps.length,
          toolFailureCount: result.toolFailureCount,
        },
      }),
    )
    if (loopResult.notes.trim()) {
      const notes = sanitizeUntrustedContextText(loopResult.notes, {
        label: "bounded_tool_loop",
      })
      knowledgeBlock = `【有界检索笔记】\n${notes}\n\n${knowledgeBlock}`
    }
  }

  // 3.3 Skill 岗位手册按需加载（默认开；AIM_SKILL_LOADING_ENABLED=false 关闭）
  const skillEnabled = env.AIM_SKILL_LOADING_ENABLED?.trim().toLowerCase() !== "false"
  const skills = await loadAimSkills({ agentId, runtimeTask, enabled: skillEnabled })
  const skillBlock = buildAimSkillBlock(skills)
  const methodologyWithSkills = [methodologyBlock, skillBlock].filter(Boolean).join("\n\n")

  // 3.5 命名方法论解析（ADR-002）：显式 ID > 文本精确命中 > none。
  // 在现有 6 块加载之后单独计算，不触碰字节等价红线；解析结果冻结进 spec.methodologyPolicy。
  const methodologyPolicy = await resolveMethodologyPolicy({
    userId: params.userId,
    methodologyProfileIds: params.methodologyProfileIds ?? spec.methodologyProfileIds,
    rawInput: spec.rawInput,
  })
  const selectedMethodologyBlock = buildMethodologyProfileBlock(methodologyPolicy)
  // spec 冻结后不可变；把解析出的 policy 合并入副本，使落 AimGeneration.runSpec 的那份含命中版本
  const specWithMethodology: AimRunSpec = methodologyPolicy.source === "none" && spec.methodologyPolicy === undefined
    ? spec
    : { ...spec, methodologyPolicy: toSpecMethodologyPolicy(methodologyPolicy) }

  // ── TaskSpec 构建（与 buildAimGeneration:1568 一致，含二次查 project/topicSelection）
  const taskSpec = await buildContextTaskSpec({ spec, params, knowledgeEntries: knowledgeCtx.entries ?? [] })

  // 4. 压缩 + 上下文预算（与 buildAimGeneration:1607 一致；selectedMethodologyBlock 作为独立预算块）
  const budgeted = await compressAndBudgetGenerationInput({
    agentId,
    spec,
    runtimeTask,
    knowledgeBlock,
    methodologyBlock: methodologyWithSkills,
    businessDiagnosisBlock,
    viralStructureBlock,
    eventStorytellingBlock,
    ipWikiBlock,
    selectedMethodologyBlock,
    trace,
  })

  // 声明式来源清单（阶段 2.2 新增；ADR-002 连带修复：methodology/ipWiki/viral 一并记录，
  // 使 contextHash 真正反映方法论变更 → 历史版本可复现）
  const contextManifest = buildContextManifest({
    spec: specWithMethodology,
    knowledgeEntries: knowledgeCtx.entries ?? [],
    includedChars: budgeted.stats.includedChars,
    methodologyPolicy,
    methodologyBlock: budgeted.blocks.methodologyBlock,
    businessDiagnosisBlock: budgeted.blocks.businessDiagnosisBlock,
    eventStorytellingBlock: budgeted.blocks.eventStorytellingBlock,
    ipWikiBlock: budgeted.blocks.ipWikiBlock,
    viralStructureBlock: budgeted.blocks.viralStructureBlock,
    selectedMethodologyBlock: budgeted.blocks.selectedMethodologyBlock,
    taskSpec,
  })

  return {
    spec: specWithMethodology,
    rawInput: spec.rawInput,
    blocks: {
      knowledge: budgeted.blocks.knowledgeBlock,
      methodology: budgeted.blocks.methodologyBlock,
      businessDiagnosis: budgeted.blocks.businessDiagnosisBlock,
      viralStructure: budgeted.blocks.viralStructureBlock,
      eventStorytelling: budgeted.blocks.eventStorytellingBlock,
      ipWiki: budgeted.blocks.ipWikiBlock,
      selectedMethodology: budgeted.blocks.selectedMethodologyBlock,
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

/** MethodologyPolicy（store 产物，含 versionRows）→ AimMethodologyPolicy（spec 冻结结果，无 versionRows）。 */
function toSpecMethodologyPolicy(policy: MethodologyPolicy): AimMethodologyPolicy {
  return {
    source: policy.source,
    selections: policy.selections.map((s) => ({
      profileId: s.profileId,
      versionId: s.versionId,
      version: s.version,
      mode: s.mode,
      reason: s.reason,
    })),
  }
}

/**
 * 项目权限校验 + 生成意图解析（prepareAimContext step 1，与 buildAimGeneration:1430 /
 * 1460 逐字等价）。项目校验抛「客户项目不存在或已归档」；意图用 rawInput +
 * polishInstruction 拼成的单条 user 消息解析。顺序、校验条件、trace 一字不改。
 */
async function checkProjectAndResolveIntent(input: {
  spec: AimRunSpec
  agentId: AimAgentId
  params: PrepareAimContextInput
  trace?: AimTraceRecorder
}) {
  const { spec, agentId, params, trace } = input

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

  return runAimTraceStep(
    trace,
    "resolve_generation_intent",
    "生成模式识别",
    async () => {
      const { resolveAimConversationIntentWithRules } = await import("@/lib/aim-conversation-intent")
      return resolveAimConversationIntentWithRules({
        agentId,
        messages: [
          {
            role: "user",
            content: [spec.rawInput, params.polishInstruction].filter(Boolean).join("\n"),
          },
        ],
      }).intent
    },
    (intent) => ({
      summary: intent.mode,
      metadata: { useKnowledge: intent.useKnowledge, useMethodology: intent.useMethodology },
    }),
  )
}

/**
 * 压缩生成输入并应用上下文预算（prepareAimContext step 4，与 buildAimGeneration:1607
 * 逐字等价）。压缩后把摘要拼到知识块前，再按 runtimeTask 的 budget profile 裁剪，
 * 并记录 context_budget trace。顺序与 budget 输入字段不变。
 */
async function compressAndBudgetGenerationInput(input: {
  agentId: AimAgentId
  spec: AimRunSpec
  runtimeTask: AimRuntimeTask
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  eventStorytellingBlock: string
  ipWikiBlock: string
  selectedMethodologyBlock: string
  trace?: AimTraceRecorder
}) {
  const { agentId, spec, runtimeTask, knowledgeBlock, trace } = input
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
    ? `【对话摘要】\n${compressed.summary}\n\n${knowledgeBlock}`
    : knowledgeBlock
  const prioritizedKnowledge = withAimFactPriorityRule(knowledgeWithContext)
  const budgeted = applyAimContextBudget({
    conversationBlock: "",
    knowledgeBlock: prioritizedKnowledge,
    methodologyBlock: input.methodologyBlock,
    businessDiagnosisBlock: input.businessDiagnosisBlock,
    viralStructureBlock: sanitizeUntrustedContextText(input.viralStructureBlock, {
      label: "market_viral",
    }),
    eventStorytellingBlock: input.eventStorytellingBlock,
    ipWikiBlock: input.ipWikiBlock,
    selectedMethodologyBlock: input.selectedMethodologyBlock,
  }, runtimeTask, agentId)
  await addAimTraceStep(trace, {
    key: "context_budget",
    label: "上下文预算",
    status: "success",
    summary: `${budgeted.stats.includedChars}/${budgeted.stats.budgetChars} 字`,
    metadata: { ...budgeted.stats, factPriority: AIM_FACT_PRIORITY_VERSION },
  })
  return budgeted
}

/**
 * 并行读取通用背景资产（知识 / 结构 / 方法论 / 竞品诊断 / IP Wiki / 事件叙事）。
 * 从 prepareAimContext step 3 逐字迁出：Promise.all 6 元素顺序、gating（projectId /
 * useKnowledge / useMethodology / agentId / useEventStorytelling）、contextOverride
 * eval 分支、trace summary/metadata 全部一字不改——这是与 buildAimGeneration 字节
 * 等价的核心，不得调整门控或顺序。
 */
async function loadGenerationContextBlocks(input: {
  spec: AimRunSpec
  params: PrepareAimContextInput
  agentId: AimAgentId
  knowledgeStrategy: ResolvedKnowledgeStrategy | undefined
  generationIntent: { useKnowledge: boolean; useMethodology: boolean }
  trace?: AimTraceRecorder
}) {
  const { spec, params, agentId, knowledgeStrategy, generationIntent, trace } = input
  const useEventStorytelling = shouldUseEventStorytelling({
    rawInput: spec.rawInput,
    topicTitle: params.topicTitle,
    topicType: params.topicType,
    topicRationale: params.topicRationale,
  })

  const shouldResolvePainIntent = Boolean(
    spec.projectId
    && generationIntent.useKnowledge
    && !params.contextOverride
    && (agentId === "content_producer" || agentId === "deep_copywriter" || agentId === "free_copywriter"),
  )

  const painIntent = shouldResolvePainIntent
    ? await runAimTraceStep(
        trace,
        "pain_intent",
        "痛点意图识别",
        () => resolvePainPointIntent({
          projectId: spec.projectId!,
          userText: [spec.rawInput, params.topicTitle, params.topicRationale].filter(Boolean).join("\n"),
        }).catch(() => null),
        (result) => ({
          summary: result?.painIds?.length
            ? `锚定 ${result.painIds.join("、")}`
            : "未锚定痛点",
          metadata: {
            painIds: result?.painIds ?? [],
            confidence: result?.confidence ?? 0,
            reason: result?.reason ?? "",
          },
        }),
      )
    : null

  const knowledgeQuery = enrichKnowledgeQueryWithPainIntent(spec.rawInput, painIntent)

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
          // 知识检索始终允许（包括 light_edit），由策略画像 topK 控制预算；
          // 避免轻改时定位/人设信息完全缺失导致文案不结合 IP。
          spec.projectId && generationIntent.useKnowledge
            ? buildAimKnowledgeContext({
                userId: params.userId,
                projectId: spec.projectId,
                agentId,
                query: knowledgeQuery,
                topicTitle: params.topicTitle,
                topicRationale: params.topicRationale,
                strategy: knowledgeStrategy,
              }).then((result) => {
                const merged = mergePainIntentIntoKnowledgeContext({
                  knowledgeBlock: result.knowledgeBlock,
                  entries: result.entries,
                  intent: painIntent,
                })
                return { ...result, ...merged }
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
        painIds: painIntent?.painIds ?? [],
      },
    }),
  )

  return { knowledgeCtx, viralStructureBlock, methodologyBlock, businessDiagnosisBlock, ipWikiBlock, eventStorytellingBlock }
}

/**
 * TaskSpec 构建：二次查 project / topicSelection（含归属过滤）→ 组装 skeleton
 * → refine（除非 route 已提供 params.taskSpec）。
 * 从 prepareAimContext 逐字迁出（与 buildAimGeneration:1568 等价），查询/字段不变。
 */
async function buildContextTaskSpec(input: {
  spec: AimRunSpec
  params: PrepareAimContextInput
  knowledgeEntries: Array<{ title?: string }>
}) {
  const { spec, params } = input
  const agentId = spec.agentId as AimAgentId

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
  const knowledgeTitles = (input.knowledgeEntries ?? []).map((e) => e.title).filter(Boolean) as string[]
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
  const base = params.taskSpec || await refineTaskSpec(taskSpecSkeleton, { enabled: false })
  const formats = (spec.outputFormats?.length
    ? spec.outputFormats
    : inferContentFormatsFromRawInput(spec.rawInput)) as import("@/lib/aim-generator").ContentFormat[]
  const outputFormatHint = formats[0] ? formatLabelForTaskSpec(formats[0]) : undefined
  return enrichTaskSpecFromRawInput(base, spec.rawInput, { outputFormatHint })
}

/**
 * 装配阶段的声明式来源清单（取代 harness 事后反查）。
 *
 * ADR-002 连带修复：此前只记 knowledge + request，系统方法论 / IP Wiki / 爆款结构
 * 的变更不会反映到 contextHash，导致编辑方法论后历史无法复现。现在把每类实际装配进
 * prompt 的 block 都记录一条，使 contextHash 真正反映本次运行的全部输入。
 */


export { resolveAimRuntimeTask }
