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
import type { AimRunSpec, AimContextSource, AimMethodologyPolicy } from "./types"
import type { PreparedAimContext } from "./contracts"
import type { AimGenerationContextOverride } from "@/lib/aim-agent-handlers"
import { AIM_FACT_PRIORITY_VERSION, withAimFactPriorityRule } from "@/lib/aim-context-priority"
import { sha256 } from "./hashing"
import {
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
  type MethodologyPolicy,
} from "@/lib/methodology-profile-store"

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
    knowledgeBlock: knowledgeCtx.knowledgeBlock,
    methodologyBlock,
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
    viralStructureBlock: input.viralStructureBlock,
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
  return params.taskSpec || await refineTaskSpec(taskSpecSkeleton, { enabled: false })
}

/**
 * 装配阶段的声明式来源清单（取代 harness 事后反查）。
 *
 * ADR-002 连带修复：此前只记 knowledge + request，系统方法论 / IP Wiki / 爆款结构
 * 的变更不会反映到 contextHash，导致编辑方法论后历史无法复现。现在把每类实际装配进
 * prompt 的 block 都记录一条，使 contextHash 真正反映本次运行的全部输入。
 */
function buildContextManifest(input: {
  spec: AimRunSpec
  knowledgeEntries: Array<{ id: string }>
  includedChars: number
  methodologyPolicy: MethodologyPolicy
  methodologyBlock: string
  businessDiagnosisBlock: string
  eventStorytellingBlock: string
  ipWikiBlock: string
  viralStructureBlock: string
  selectedMethodologyBlock: string
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
}): AimContextSource[] {
  const { spec, knowledgeEntries, includedChars } = input
  const sources: AimContextSource[] = []

  // 知识条目
  for (const entry of knowledgeEntries) {
    sources.push({
      kind: "knowledge",
      id: entry.id,
      charCount: includedChars,
    })
  }

  // ── 方法论来源（系统 + 命名）──
  // 系统方法论：用实际装配 block 的内容 hash 作为 contentHash（version 等价物），
  // 这样后台编辑方法论内容后 contextHash 真正变化。
  pushBlockSource(sources, "methodology", "agent_methodology:ip_copywriting", input.methodologyBlock)
  pushBlockSource(sources, "methodology", "agent_methodology:business_diagnosis", input.businessDiagnosisBlock)
  pushBlockSource(sources, "methodology", "agent_methodology:event_storytelling", input.eventStorytellingBlock)
  // 命名方法论：用 versionRow 的 versionId + checksum，精确到发布的版本
  for (const row of input.methodologyPolicy.versionRows) {
    sources.push({
      kind: "methodology",
      id: `named_methodology:${row.versionId}`,
      updatedAt: row.updatedAt,
      charCount: input.selectedMethodologyBlock.length,
      contentHash: row.checksum,
    })
  }

  // ── IP Wiki / 爆款结构 ──
  pushBlockSource(sources, "ip_wiki", "ip_wiki:block", input.ipWikiBlock)
  pushBlockSource(sources, "market_viral", "viral_structure", input.viralStructureBlock)

  // ── 计划模式任务单来源（workflow_brief）──
  // 当 taskSpec 存在时记录其内容哈希，使 contextHash 反映任务单变更
  if (input.taskSpec) {
    const briefJson = JSON.stringify(input.taskSpec)
    sources.push({
      kind: "workflow_brief",
      id: "workflow_brief:task_spec",
      charCount: briefJson.length,
      contentHash: sha256(briefJson),
    })
  }

  // request 来源（rawInput）始终记录，作为 contextHash 的稳定基线
  sources.push({
    kind: "request",
    id: "raw_input",
    charCount: spec.rawInput.length,
    contentHash: sha256(spec.rawInput),
  })
  return sources
}

/** 非空 block 才记进 manifest（内容 hash 作为变更追踪依据）。 */
function pushBlockSource(
  sources: AimContextSource[],
  kind: AimContextSource["kind"],
  id: string,
  content: string,
): void {
  if (!content) return
  sources.push({ kind, id, charCount: content.length, contentHash: sha256(content) })
}

export { resolveAimRuntimeTask }
