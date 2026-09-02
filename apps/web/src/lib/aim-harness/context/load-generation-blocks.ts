import {
  type ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
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
import { buildIpWikiBlock, loadIpWikiPagesIndexed } from "@/lib/ip-wiki/context"
import { buildViralStructureBlock } from "@/lib/aim-generator"
import {
  runAimTraceStep,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import type { AimAgentId } from "../contracts"
import type { AimRunSpec } from "../types"
import type { PrepareAimContextInput } from "../context-assembly"
import { isAimFastSpokenRoute } from "../fast-spoken-policy"

/**
 * 并行读取通用背景资产（知识 / 结构 / 方法论 / 竞品诊断 / IP Wiki / 事件叙事）。
 * 从 prepareAimContext step 3 逐字迁出：Promise.all 6 元素顺序、gating（projectId /
 * useKnowledge / useMethodology / agentId / useEventStorytelling）、contextOverride
 * eval 分支、trace summary/metadata 全部一字不改——这是与 buildAimGeneration 字节
 * 等价的核心，不得调整门控或顺序。
 */
/**
 * 用户指令唯一真源整改：IP Wiki / 项目事实底盘不再无条件自动加载。
 * 仅当 (a) 用户明确要求结合项目/知识库资料，或 (b) 当前任务已确认需要项目事实
 * （useKnowledge 且非轻改）时加载；轻改原稿默认不注入业务事实，避免偷偷扩写。
 * 无项目（projectId 为空）时恒为 false。
 */
export function resolveIpWikiLoadFlag(input: {
  projectId?: string | null
  rawInput: string
  useKnowledge: boolean
  runtimeTask?: string
}): boolean {
  if (!input.projectId) return false
  const explicitProjectMaterialRequest = /结合(?:一下)?(?:项目|知识库|档案)|(?:用|参考|按)(?:一下)?(?:项目|知识库|档案)的?(?:资料|信息|事实|数据)?|项目资料|知识库资料/.test(input.rawInput)
  return explicitProjectMaterialRequest
    || (input.useKnowledge && input.runtimeTask !== "light_edit")
}

export async function loadGenerationContextBlocks(input: {
  spec: AimRunSpec
  params: PrepareAimContextInput
  agentId: AimAgentId
  knowledgeStrategy: ResolvedKnowledgeStrategy | undefined
  generationIntent: { useKnowledge: boolean; useMethodology: boolean }
  /** 方法论类技能信号：决定爆款结构/IP文案方法论/事件叙事是否按需注入 */
  methodologySignals?: Set<string>
  trace?: AimTraceRecorder
}) {
  const { spec, params, agentId, knowledgeStrategy, generationIntent, methodologySignals, trace } = input
  const copySignal = methodologySignals?.has("ip_copywriting") ?? false
  const viralSignal = methodologySignals?.has("viral_structure") ?? false
  const eventSignal = methodologySignals?.has("event_storytelling") ?? false
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
    && !isAimFastSpokenRoute(spec.modelPolicy.routeKey)
    && (agentId === "content_producer" || agentId === "work_editor" || agentId === "free_copywriter"),
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

  const shouldLoadIpWiki = resolveIpWikiLoadFlag({
    projectId: spec.projectId,
    rawInput: spec.rawInput,
    useKnowledge: generationIntent.useKnowledge,
    runtimeTask: spec.runtimeTask,
  })

  const [knowledgeCtx, viralStructureBlock, methodologyBlock, businessDiagnosisBlock, ipWikiBlock, eventStorytellingBlock, ipWikiPages] = await runAimTraceStep(
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
          {},
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
          viralSignal ? buildViralStructureBlock() : Promise.resolve(""),
          copySignal ? buildIpCopywritingMethodologyBlock() : Promise.resolve(""),
          generationIntent.useMethodology && agentId === "business_system_diagnosis"
            ? buildBusinessDiagnosisMethodologyBlock()
            : Promise.resolve(""),
          shouldLoadIpWiki ? buildIpWikiBlock({ projectId: spec.projectId }) : Promise.resolve(""),
          eventSignal && (agentId === "content_producer" || agentId === "work_editor") && useEventStorytelling
            ? buildEventStorytellingMethodologyBlock()
            : Promise.resolve(""),
          shouldLoadIpWiki ? loadIpWikiPagesIndexed({ projectId: spec.projectId }) : Promise.resolve({}),
        ]),
    ([knowledge, viralStructure, methodology, businessDiagnosis, ipWiki, eventStory, ipWikiPagesVal]) => ({
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
        ipWikiPagesCount: Object.keys(ipWikiPagesVal ?? {}).length,
      },
    }),
  )

  return { knowledgeCtx, viralStructureBlock, methodologyBlock, businessDiagnosisBlock, ipWikiBlock, eventStorytellingBlock, ipWikiPages }
}
