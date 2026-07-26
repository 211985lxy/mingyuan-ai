/**
 * AIM 高稳路由（不惜预算版）
 *
 * 流程：规则初判 →（写作类 Agent 默认）LLM 二次消歧 → 会话状态机纠偏 → 冻结 runtimeTask/formats
 * 任意 LLM 失败一律回退规则结果，保证可用性。
 *
 * Eval / 确定性测试可通过 stableRouting:false 或 AIM_STABLE_ROUTING=0 关闭。
 */

import { LLMClient } from "@/lib/llm/client"
import { inferContentFormatsFromRawInput } from "@/lib/aim-format-inference"
import {
  resolveAimRuntimeTask,
  resolveKnowledgeStrategy,
  type AimRuntimeTask,
  type ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
import type { AimConversationMode } from "@/lib/aim-conversation-intent"
import type { ContentFormat } from "@/lib/aim-generator"
import type { AimRunSpec } from "@/lib/aim-harness/types"
import type { PlanRunInput } from "@/lib/aim-harness/planner"
import {
  actionToRuntimeTask,
  isIntentVectorFallbackEnabled,
  matchTurnIntentByVector,
  shouldTryVectorIntentFallback,
} from "@/lib/aim-intent-vector"

export type AimSessionPhase = "drafting" | "editing" | "clarifying"

export interface StableRoutingResult {
  runtimeTask: AimRuntimeTask
  outputFormats: ContentFormat[]
  knowledgeStrategy: ResolvedKnowledgeStrategy
  conversationMode?: AimConversationMode
  sessionPhase: AimSessionPhase
  classifiedBy: "rule" | "llm" | "rule_fallback" | "vector"
  confidence: number
  reason: string
}

const WRITING_AGENTS = new Set([
  "content_producer",
  "free_copywriter",
  "work_editor",
])

const RUNTIME_TASKS = new Set<AimRuntimeTask>([
  "light_edit",
  "rewrite_copy",
  "new_copy",
  "positioning_topic",
  "quality_review",
])

const CONVERSATION_MODES = new Set<AimConversationMode>([
  "chat",
  "follow_up_edit",
  "local_edit",
  "select_version",
  "formal_delivery",
  "new_task",
  "clarify_task_boundary",
])

const LOCAL_PART_WORDS = [
  "开头", "前3秒", "前三秒", "第一句话", "第一句", "钩子", "起手", "开场",
  "标题", "结尾", "收尾", "CTA", "行动引导",
]

/**
 * 是否启用高稳路由。默认关闭（等有用户使用经验后再开）。
 * 显式 true 或 AIM_STABLE_ROUTING=1 才开启。
 */
export function isStableRoutingEnabled(flag?: boolean): boolean {
  if (flag === true) return true
  if (flag === false) return false
  const env = process.env.AIM_STABLE_ROUTING
  return env === "1" || env === "true"
}

export function resolveAimSessionPhase(input: {
  rawInput: string
  messages?: Array<{ role: string; content: string }>
  conversationMode?: AimConversationMode
  runtimeTask?: AimRuntimeTask
}): AimSessionPhase {
  const text = input.rawInput || ""
  const hasAssistant = (input.messages ?? []).some((m) => m.role === "assistant")
  if (
    input.conversationMode === "clarify_task_boundary"
    || /是改旧稿还是|另开|确认一下|你是要改/.test(text)
  ) {
    return "clarifying"
  }
  if (
    input.conversationMode === "local_edit"
    || input.conversationMode === "follow_up_edit"
    || input.runtimeTask === "light_edit"
    || (hasAssistant && LOCAL_PART_WORDS.some((w) => text.includes(w)))
    || (hasAssistant && /这篇|这版|上面|原稿|不要换|别重写/.test(text))
  ) {
    return "editing"
  }
  return "drafting"
}

/** 规则置信度：越高越不需要 LLM，但高稳模式仍会调用 LLM 复核。 */
export function scoreRuleRoutingConfidence(input: {
  runtimeTask: AimRuntimeTask
  rawInput: string
  taskType?: string
  targetFormats?: ContentFormat[]
}): number {
  const text = input.rawInput || ""
  if (input.runtimeTask === "quality_review" || input.taskType === "quality_check") return 0.98
  if (input.runtimeTask === "light_edit" && LOCAL_PART_WORDS.some((w) => text.includes(w))) return 0.93
  if (input.runtimeTask === "new_copy" && (input.targetFormats?.length || /写一篇|写一版|种草|帮我写/.test(text))) {
    return 0.88
  }
  if (input.runtimeTask === "rewrite_copy" && /重写|改写|重做/.test(text)) return 0.9
  if (/优化|自然|口语化/.test(text) && /写|生成|种草/.test(text)) return 0.45
  if (/人设|定位|选题/.test(text) && /种草|小红书|口播|文案/.test(text)) return 0.4
  return 0.7
}

function parseStableRoutingJson(raw: string): Partial<{
  runtimeTask: AimRuntimeTask
  outputFormats: ContentFormat[]
  conversationMode: AimConversationMode
  reason: string
  confidence: number
}> | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const runtimeTask = typeof parsed.runtimeTask === "string" && RUNTIME_TASKS.has(parsed.runtimeTask as AimRuntimeTask)
      ? parsed.runtimeTask as AimRuntimeTask
      : undefined
    const conversationMode = typeof parsed.conversationMode === "string"
      && CONVERSATION_MODES.has(parsed.conversationMode as AimConversationMode)
      ? parsed.conversationMode as AimConversationMode
      : undefined
    const outputFormats = Array.isArray(parsed.outputFormats)
      ? (parsed.outputFormats.filter((f) => typeof f === "string") as ContentFormat[])
      : undefined
    return {
      runtimeTask,
      conversationMode,
      outputFormats,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
    }
  } catch {
    return null
  }
}

async function classifyRuntimeTaskWithLlm(input: {
  agentId: string
  rawInput: string
  ruleTask: AimRuntimeTask
  ruleFormats: ContentFormat[]
  sessionPhase: AimSessionPhase
  messages?: Array<{ role: string; content: string }>
}): Promise<Partial<{
  runtimeTask: AimRuntimeTask
  outputFormats: ContentFormat[]
  conversationMode: AimConversationMode
  reason: string
  confidence: number
}> | null> {
  const history = (input.messages ?? [])
    .slice(-4)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${String(m.content).slice(0, 200)}`)
    .join("\n")

  const prompt = [
    "你是 AIM 运行时任务分类器。只输出 JSON，禁止 markdown，禁止编造业务事实。",
    "从枚举中选择 runtimeTask：light_edit | rewrite_copy | new_copy | positioning_topic | quality_review",
    "从枚举中选择 conversationMode：chat | follow_up_edit | local_edit | select_version | formal_delivery | new_task | clarify_task_boundary",
    "outputFormats 只能从：video_script, wechat_article, moments_post, community_message, shooting_brief, raw_copy, koubo_script, xiaohongshu_post",
    "硬规则：",
    "- 只改开头/前三秒/标题/结尾/钩子 → light_edit + local_edit，不要全文重写",
    "- 写一篇/种草/出一版 → new_copy；即使出现人设/定位词也不要判 positioning_topic",
    "- 重写/改写/重做 → rewrite_copy",
    "- 会话阶段 editing 时，默认倾向局部改或追改，除非用户明确要整篇重做或新开任务",
    "",
    `agentId=${input.agentId}`,
    `sessionPhase=${input.sessionPhase}`,
    `规则初判 runtimeTask=${input.ruleTask}`,
    `规则初判 formats=${JSON.stringify(input.ruleFormats)}`,
    `当前用户输入：${input.rawInput}`,
    history ? `最近对话：\n${history}` : "最近对话：（无）",
    "",
    '输出：{"runtimeTask":"...","conversationMode":"...","outputFormats":["..."],"confidence":0.0,"reason":"一句话"}',
  ].join("\n")

  try {
    const completion = await LLMClient.shared().complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 280,
      responseFormat: { type: "json_object" },
    })
    return parseStableRoutingJson(completion.content)
  } catch {
    return null
  }
}

/**
 * 高稳路由：规则 +（默认）LLM 复核 + 会话状态纠偏。
 */
export async function resolveStableAimRouting(input: {
  agentId: string
  rawInput: string
  taskType?: string
  polishInstruction?: string
  targetFormats?: ContentFormat[]
  topicType?: string
  hotTopic?: string
  videoCopyExtractionId?: string
  contentScenario?: PlanRunInput["contentScenario"]
  copyStudioModule?: PlanRunInput["agentModule"]
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  conversationMode?: AimConversationMode
  /** 已由 planner 给出的初值；有则作为规则底稿 */
  ruleRuntimeTask?: AimRuntimeTask
  stableRouting?: boolean
}): Promise<StableRoutingResult> {
  const formats = input.targetFormats?.length
    ? input.targetFormats
    : inferContentFormatsFromRawInput(input.rawInput)

  const ruleTask = input.ruleRuntimeTask ?? resolveAimRuntimeTask({
    agentId: input.agentId,
    input: input.rawInput,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    targetFormats: formats,
  })

  let sessionPhase = resolveAimSessionPhase({
    rawInput: input.rawInput,
    messages: input.messages,
    conversationMode: input.conversationMode,
    runtimeTask: ruleTask,
  })

  // 会话纠偏：editing + 局部部位 → 强制 light_edit（在 LLM 之前先收紧）
  let runtimeTask = ruleTask
  if (
    sessionPhase === "editing"
    && LOCAL_PART_WORDS.some((w) => input.rawInput.includes(w))
    && !/重写|改写|重做|整篇/.test(input.rawInput)
  ) {
    runtimeTask = "light_edit"
  }

  const ruleConfidence = scoreRuleRoutingConfidence({
    runtimeTask,
    rawInput: input.rawInput,
    taskType: input.taskType,
    targetFormats: formats,
  })

  // 规则低置信时：向量兜底（比 LLM 便宜；失败则保持规则）
  // 不依赖 stableRouting 开关——微创默认可用；stable 开启时仍可再走 LLM 复核
  if (shouldTryVectorIntentFallback(ruleConfidence) && isIntentVectorFallbackEnabled() && WRITING_AGENTS.has(input.agentId)) {
    try {
      const vectorMatch = await matchTurnIntentByVector(input.rawInput)
      const vectorTask = vectorMatch ? actionToRuntimeTask(vectorMatch.action) : undefined
      if (vectorTask && vectorTask !== runtimeTask && RUNTIME_TASKS.has(vectorTask)) {
        runtimeTask = vectorTask
        sessionPhase = resolveAimSessionPhase({
          rawInput: input.rawInput,
          messages: input.messages,
          conversationMode: input.conversationMode,
          runtimeTask,
        })
        const knowledgeStrategy = resolveKnowledgeStrategy({
          runtimeTask,
          topicType: input.topicType,
          hotTopic: input.hotTopic,
          videoCopyExtractionId: input.videoCopyExtractionId,
          taskType: input.taskType,
          polishInstruction: input.polishInstruction,
          contentScenario: input.contentScenario,
          copyStudioModule: input.copyStudioModule,
        })
        const enabledAfterVector = isStableRoutingEnabled(input.stableRouting) && WRITING_AGENTS.has(input.agentId)
        if (!enabledAfterVector) {
          return {
            runtimeTask,
            outputFormats: formats,
            knowledgeStrategy,
            conversationMode: input.conversationMode,
            sessionPhase,
            classifiedBy: "vector",
            confidence: vectorMatch!.score,
            reason: `vector fallback matched: ${vectorMatch!.phrase}`,
          }
        }
        // stable 开启：带着向量结果继续 LLM 复核（下方逻辑）
      }
    } catch {
      // 向量失败保持规则
    }
  }

  const enabled = isStableRoutingEnabled(input.stableRouting) && WRITING_AGENTS.has(input.agentId)
  if (!enabled) {
    const knowledgeStrategy = resolveKnowledgeStrategy({
      runtimeTask,
      topicType: input.topicType,
      hotTopic: input.hotTopic,
      videoCopyExtractionId: input.videoCopyExtractionId,
      taskType: input.taskType,
      polishInstruction: input.polishInstruction,
      contentScenario: input.contentScenario,
      copyStudioModule: input.copyStudioModule,
    })
    return {
      runtimeTask,
      outputFormats: formats,
      knowledgeStrategy,
      conversationMode: input.conversationMode,
      sessionPhase,
      classifiedBy: "rule",
      confidence: ruleConfidence,
      reason: "stable routing disabled; rule only",
    }
  }

  const llm = await classifyRuntimeTaskWithLlm({
    agentId: input.agentId,
    rawInput: input.rawInput,
    ruleTask: runtimeTask,
    ruleFormats: formats,
    sessionPhase,
    messages: input.messages,
  })

  let classifiedBy: StableRoutingResult["classifiedBy"] = "rule_fallback"
  let reason = "llm unavailable; rule fallback"
  let confidence = ruleConfidence
  let conversationMode = input.conversationMode
  let outputFormats = formats

  if (llm?.runtimeTask) {
    runtimeTask = llm.runtimeTask
    classifiedBy = "llm"
    reason = llm.reason || "llm stable routing"
    confidence = typeof llm.confidence === "number" ? llm.confidence : 0.86
    if (llm.conversationMode) conversationMode = llm.conversationMode
    if (llm.outputFormats?.length) outputFormats = llm.outputFormats
  }

  // LLM 之后再套一次会话硬边界，防止模型把「改开头」抬成 rewrite
  sessionPhase = resolveAimSessionPhase({
    rawInput: input.rawInput,
    messages: input.messages,
    conversationMode,
    runtimeTask,
  })
  if (
    sessionPhase === "editing"
    && LOCAL_PART_WORDS.some((w) => input.rawInput.includes(w))
    && !/重写|改写|重做|整篇/.test(input.rawInput)
    && runtimeTask !== "light_edit"
  ) {
    runtimeTask = "light_edit"
    reason = `${reason}; sessionPhase forced light_edit`
  }

  const knowledgeStrategy = resolveKnowledgeStrategy({
    runtimeTask,
    topicType: input.topicType,
    hotTopic: input.hotTopic,
    videoCopyExtractionId: input.videoCopyExtractionId,
    taskType: input.taskType,
    polishInstruction: input.polishInstruction,
    contentScenario: input.contentScenario,
    copyStudioModule: input.copyStudioModule,
  })

  return {
    runtimeTask,
    outputFormats,
    knowledgeStrategy,
    conversationMode,
    sessionPhase,
    classifiedBy,
    confidence,
    reason,
  }
}

/** 把高稳路由结果合并进已冻结的 AimRunSpec（返回新对象）。 */
export function applyStableRoutingToSpec(
  spec: AimRunSpec,
  routing: StableRoutingResult,
): AimRunSpec {
  return Object.freeze({
    ...spec,
    runtimeTask: routing.runtimeTask,
    knowledgeStrategy: routing.knowledgeStrategy,
    outputFormats: routing.outputFormats.length ? routing.outputFormats : spec.outputFormats,
    conversationMode: routing.conversationMode ?? spec.conversationMode,
  })
}
