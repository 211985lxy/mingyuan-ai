import { executeGenerateLLM } from "@/lib/aim-agent-model"
import { AIM_OUTPUT_MAX_CHARS, buildExplicitWordCountPriorityRule } from "@/lib/aim-benchmark-length"
import {
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_OPERATING_LOGIC_RULE,
  CONTENT_PRODUCER_REPLY_OPENING,
  buildContentProducerKnowledgeRule,
} from "@/lib/aim-agent-prompts"
import { METHODOLOGY_INJECTION_PREFACE } from "@/lib/methodology/methodology-injection-preface"
import { resolveContentProducerProgressiveFlags } from "@/lib/aim/progressive-prompt-flags"
import {
  AIM_INTERNAL_INTENT_GATE,
  AIM_NORTH_STAR_GOAL,
  AIM_SESSION_PRIORITY_RULES,
  LIGHT_EDIT_OUTPUT_BOUNDARY,
  LIGHT_EDIT_USER_INSTRUCTION,
  RUNTIME_TASK_LABELS,
} from "@/lib/aim-intent-boundaries"
import { buildPromptFewshotBlock } from "@/lib/aim-prompt-fewshots"
import { COLLABORATION_MODE_LABELS, type TaskSpec } from "@/lib/task-spec"
import { formatAimTurnIntentBlock, looksLikePassagePolish, resolveAimTurnIntent } from "@/lib/aim-turn-intent"
import type { AimGenerateContext } from "./aim-agent-handlers"
import { parseMultiFormatResponse, type ContentFormat } from "./aim-generator"
import {
  CONTENT_CREATION_TRACE_RULE,
  NEWSROOM_SAMPLE_CITATION_RULE,
  ensureContentCreationTrace,
} from "./aim-content-creation-trace"
import { getMaterialAnchorsFromTaskSpec } from "@/features/newsroom/services/build-source-brief"
import { buildGoalRewritePromptAppendix, verifyMethodologyGoal } from "@/lib/methodology/goal-verifier"
import {
  buildGroundedNumericClaimRule,
  buildGenerationSafetyRetryPrompt,
  inspectGenerationSafety,
  materializeApprovedFacts,
  scrubUnsupportedAnecdoteSentences,
  scrubUnsupportedNumericSentences,
} from "@/lib/aim-generation-guardrails"
import { buildGenerationNumericEvidence, scrubLeakedLightEditFeedback } from "@/lib/aim-generation-text"
import {
  buildIpWikiComplianceRewritePrompt,
  verifyIpWikiCompliance,
} from "@/lib/ip-wiki/compliance"
import { AIM_FAST_SPOKEN_MAX_GENERATION_ATTEMPTS, isAimFastSpokenRoute } from "@/lib/aim-harness/fast-spoken-policy"
import { buildSpokenLengthRetryPrompt, cleanSpokenDeliveryArtifacts, findIncompleteGenerationFormats, findOverlongGenerationFormats, fitOverlongSpokenContent, getSpokenLengthGateDiagnostics, isSpokenScriptFormat } from "@/lib/aim-spoken-length"
export { CONTENT_CREATION_TRACE_RULE, NEWSROOM_SAMPLE_CITATION_RULE, ensureContentCreationTrace }
export {
  findLightEditScopeViolationFormats,
  findUnsupportedFirstPersonClaimFormats,
  isGenericContentRequestWithoutFacts,
} from "@/lib/aim-generation-guardrails"

function renderKnownFacts(facts: TaskSpec["knownFacts"] | undefined, limit?: number): string | null {
  if (!facts?.length) return null
  const rows = (limit ? facts.slice(0, limit) : facts)
    .map((f) => `  · ${f.statement}${f.source ? `（来源：${f.source}）` : ""}`)
  return `- 已知事实（不可编造增改）：\n${rows.join("\n")}`
}

function renderTaskSpecLines(taskSpec: TaskSpec, opts?: { compact?: boolean }): string[] {
  const compact = opts?.compact === true
  const lines: Array<string | null> = [
    `- 内容目标：${taskSpec.goal}`,
    `- 协作模式：${COLLABORATION_MODE_LABELS[taskSpec.mode] || taskSpec.mode}`,
    `- 风险等级：${taskSpec.riskLevel}`,
    taskSpec.targetCustomer ? `- 目标客户：${taskSpec.targetCustomer}` : null,
    taskSpec.realProblem ? `- 真实问题：${taskSpec.realProblem}` : null,
    taskSpec.contentTask ? `- 主要内容任务：${taskSpec.contentTask}` : null,
    taskSpec.trustAssetType ? `- 优先信任证据：${taskSpec.trustAssetType}` : null,
    taskSpec.exclusiveEvidence ? `- 专属证据：${taskSpec.exclusiveEvidence}` : null,
    taskSpec.desiredAction ? `- 期望动作：${taskSpec.desiredAction}` : null,
    taskSpec.dealPath ? `- 成交承接：${taskSpec.dealPath}` : null,
    taskSpec.coreMessage ? `- 核心信息：${taskSpec.coreMessage}` : null,
    taskSpec.platform ? `- 发布平台：${taskSpec.platform}` : null,
    taskSpec.useScenario ? `- 使用场景：${taskSpec.useScenario}` : null,
    taskSpec.outputFormat ? `- 输出格式：${taskSpec.outputFormat}` : null,
    taskSpec.style ? `- 风格：${taskSpec.style}` : null,
    taskSpec.lengthRule ? `- 长度要求：${taskSpec.lengthRule}` : null,
    taskSpec.ctaText ? `- CTA：${taskSpec.ctaText}` : null,
    renderKnownFacts(taskSpec.knownFacts, compact ? 5 : undefined),
  ]

  if (!compact) {
    if (taskSpec.unknowns?.length) {
      lines.push(`- 信息缺口（不得写成事实）：${taskSpec.unknowns.join("；")}`)
    }
    if (taskSpec.assumptions?.length) {
      lines.push(
        `- 交付假设（必须标注为假设，不可写成已验证事实）：${taskSpec.assumptions
          .map((a) => `${a.statement}[${a.impact}]`)
          .join("；")}`,
      )
    }
    if (taskSpec.nextAction) {
      lines.push(`- 内部下一步（勿原样输出给用户）：${taskSpec.nextAction}`)
    }
  }

  return lines.filter(Boolean) as string[]
}

/**
 * @description 构建工作流上下文文本（本轮意图 + 任务单、选题、热点等）
 * @param context - AIM 生成上下文
 * @returns 格式化的工作流上下文文本
 */
export function buildWorkflowContext(context: {
  taskSpec?: AimGenerateContext["taskSpec"]
  topicTitle?: AimGenerateContext["topicTitle"]
  topicRationale?: AimGenerateContext["topicRationale"]
  hotTopic?: AimGenerateContext["hotTopic"]
  polishInstruction?: AimGenerateContext["polishInstruction"]
  rawInput?: string
  runtimeTask?: AimGenerateContext["runtimeTask"]
  targetFormats?: AimGenerateContext["targetFormats"]
  confirmedTurnIntent?: AimGenerateContext["confirmedTurnIntent"]
}): string {
  const turnIntent = context.confirmedTurnIntent || resolveAimTurnIntent({
    rawInput: context.rawInput || context.taskSpec?.goal || "",
    runtimeTask: context.runtimeTask,
    targetFormats: context.targetFormats,
    polishInstruction: context.polishInstruction,
  })
  const taskSpec = context.taskSpec
  return [
    formatAimTurnIntentBlock(turnIntent),
    taskSpec
      ? ["本次内容运营任务单：", ...renderTaskSpecLines(taskSpec)].join("\n")
      : null,
    context.topicTitle
      ? `选定爆款选题：${context.topicTitle}${context.topicRationale ? `\n选题依据：${context.topicRationale}` : ""}`
      : null,
    context.hotTopic
      ? `需要结合的当前热点：${context.hotTopic}\n要求：只做自然融合，必须找到热点与客户需求、产品卖点或老板经验之间的真实关联，禁止硬蹭热点。`
      : null,
    context.polishInstruction
      ? `文案审核与优化要求：${context.polishInstruction}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * 交货文案等轻量 Agent 使用的精简任务单（不含方法论/viral，只保留执行约束与事实）。
 */
export function buildCompactWorkflowContext(
  taskSpec: TaskSpec | undefined | null,
  opts?: {
    rawInput?: string
    runtimeTask?: AimGenerateContext["runtimeTask"]
    confirmedTurnIntent?: AimGenerateContext["confirmedTurnIntent"]
  },
): string {
  const turnIntent = opts?.confirmedTurnIntent || resolveAimTurnIntent({
    rawInput: opts?.rawInput || taskSpec?.goal || "",
    runtimeTask: opts?.runtimeTask,
    polishInstruction: undefined,
  })
  const intentBlock = formatAimTurnIntentBlock(turnIntent)
  if (!taskSpec) return intentBlock
  const lines = [
    taskSpec.platform ? `- 发布平台：${taskSpec.platform}` : null,
    taskSpec.outputFormat ? `- 输出格式：${taskSpec.outputFormat}` : null,
    taskSpec.lengthRule ? `- 长度要求：${taskSpec.lengthRule}` : null,
    taskSpec.style ? `- 风格：${taskSpec.style}` : null,
    taskSpec.ctaText ? `- CTA：${taskSpec.ctaText}` : null,
    taskSpec.coreMessage ? `- 核心信息：${taskSpec.coreMessage}` : null,
    renderKnownFacts(taskSpec.knownFacts, 5),
  ].filter(Boolean)
  if (!lines.length) return intentBlock
  return `${intentBlock}\n\n本次任务约束（听指令优先，但不得违背以下已确认事实）：\n${lines.join("\n")}`
}

export interface LayeredAimPromptInput {
  roleBlock: string
  runtimeTask?: string
  taskConstraintExtra?: string
  contextBlocks: string[]
  formatBlock?: string
  qualityRedlines: string[]
}

/**
 * 统一分层 Prompt：系统角色 → 任务约束 → 上下文素材 → 输出格式 → 质量红线。
 */
export function composeLayeredAimPrompt(input: LayeredAimPromptInput): string {
  const taskLabel = input.runtimeTask
    ? (RUNTIME_TASK_LABELS[input.runtimeTask] || input.runtimeTask)
    : "未标注"
  const sections = [
    `【系统角色】\n北极星目标：${AIM_NORTH_STAR_GOAL}\n\n${input.roleBlock}`,
    [
      `【任务约束】\n【任务类型: ${taskLabel}】`,
      input.runtimeTask === "light_edit" ? LIGHT_EDIT_OUTPUT_BOUNDARY : null,
      AIM_INTERNAL_INTENT_GATE,
      input.taskConstraintExtra || null,
    ].filter(Boolean).join("\n"),
    `【上下文素材】\n${input.contextBlocks.filter(Boolean).join("\n\n") || "（无额外上下文）"}`,
    input.formatBlock ? `【输出格式】\n${input.formatBlock}` : null,
    `【质量红线】\n${input.qualityRedlines.filter(Boolean).join("\n")}`,
  ]
  return sections.filter(Boolean).join("\n\n")
}

/**
 * @description 执行 LLM 生成并带对标抄袭检测重试
 * @param agentId - 智能体 ID
 * @returns 生成结果（完成响应和解析内容）
 */
export async function executeGenerateLLMWithBenchmarkRetry(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  context: AimGenerateContext,
  targetFormats: ContentFormat[],
) {
  const groundedNumericRule = buildGroundedNumericClaimRule(context.rawInput)
  let activePrompt = `${userPrompt}${groundedNumericRule}`
  const isLightEdit = context.runtimeTask === "light_edit"
  const fastSpokenRoute = isAimFastSpokenRoute(context.modelPolicy?.routeKey)
  const maxAttempts = fastSpokenRoute ? AIM_FAST_SPOKEN_MAX_GENERATION_ATTEMPTS : 3
  const methodologyPlan = context.methodologyPlan ?? context.taskSpec?.methodologyPlan
  const ipWikiPages = context.ipWikiPages
  const numericEvidence = buildGenerationNumericEvidence(context)
  let isLengthRewrite = false
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const modelPolicy = isLengthRewrite && context.modelPolicy
      ? { ...context.modelPolicy, temperature: 0.2 }
      : context.modelPolicy
    const completion = await executeGenerateLLM(agentId, systemPrompt, activePrompt, modelPolicy)
    const parsed = parseMultiFormatResponse(completion.content, targetFormats)
    for (const format of targetFormats) {
      parsed[format] = materializeApprovedFacts(parsed[format] || "", context.rawInput)
      if (isLightEdit) parsed[format] = scrubLeakedLightEditFeedback(parsed[format] || "", context.rawInput)
      parsed[format] = scrubUnsupportedNumericSentences(parsed[format] || "", context.rawInput, numericEvidence, !isLightEdit && !fastSpokenRoute)
      parsed[format] = scrubUnsupportedAnecdoteSentences(parsed[format] || "", context.rawInput)
      if (isSpokenScriptFormat(format)) {
        parsed[format] = fitOverlongSpokenContent(parsed[format] || "", context.rawInput)
        parsed[format] = cleanSpokenDeliveryArtifacts(parsed[format] || "")
      }
    }
    const safety = inspectGenerationSafety(context, parsed, targetFormats)
    const incompleteFormats = findIncompleteGenerationFormats({
      parsed,
      targetFormats,
      rawInput: context.rawInput || "",
      finishReason: completion.finishReason,
      enforceSpokenLength: !isLightEdit,
    })
    const overlongFormats = isLightEdit ? [] : findOverlongGenerationFormats({
      parsed,
      targetFormats,
      rawInput: context.rawInput || "",
    })
    if (incompleteFormats.length || overlongFormats.length) {
      isLengthRewrite = true
      console.warn("[aim-generation] spoken length gate", getSpokenLengthGateDiagnostics({
        attempt: attempt + 1,
        parsed,
        targetFormats,
        rawInput: context.rawInput || "",
        incompleteFormats,
        overlongFormats,
      }))
    }
    const goalVerify = !isLightEdit && methodologyPlan
      ? verifyMethodologyGoal(
          methodologyPlan,
          targetFormats.map((format) => ({ format, content: parsed[format] || "" })),
        )
      : { ok: true, issues: [], summary: "" }

    const formatContents = targetFormats.map((fmt) => parsed[fmt] || "")
    const ipCompliance = !isLightEdit && ipWikiPages && Object.keys(ipWikiPages).length > 0
      ? await verifyIpWikiCompliance(formatContents, ipWikiPages)
      : { ok: true, issues: [], summary: "" }

    if (
      safety.copiedFormats.length === 0
      && safety.unsupportedNumericClaimFormats.length === 0
      && safety.unsupportedClaimFormats.length === 0
      && safety.lightEditScopeViolationFormats.length === 0
      && incompleteFormats.length === 0
      && goalVerify.ok
      && ipCompliance.ok
    ) {
      return { completion, parsed, goalVerify, ipCompliance }
    }
    if (attempt === maxAttempts - 1) {
      if (incompleteFormats.length) {
        const hasSubstantialContent = incompleteFormats.every((format) => {
          const body = (parsed[format] || "").replace(/\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/, "").trim()
          return body.length >= 80
        })
        if (!hasSubstantialContent) {
          throw new Error("生成结果被截断或正文过短，已停止交付，请重试本次请求")
        }
      }
      if (
        safety.copiedFormats.length
        || safety.unsupportedNumericClaimFormats.length
        || safety.unsupportedClaimFormats.length
        || safety.lightEditScopeViolationFormats.length
      ) {
        throw new Error("生成结果出现事实风险、过度近似原文或轻改信息丢失，已停止交付")
      }
      // 目标质检或 IP 合规末次仍失败：交付最后一版，由 METHOD_NOTE 记录；不硬抛
      return { completion, parsed, goalVerify, ipCompliance }
    }

    if (incompleteFormats.length) {
      activePrompt = buildSpokenLengthRetryPrompt({
        userPrompt,
        rawInput: context.rawInput || "",
        parsed,
        targetFormats,
        incompleteFormats,
        overlongFormats: [],
      })
    } else if (
      safety.copiedFormats.length
      || safety.unsupportedNumericClaimFormats.length
      || safety.unsupportedClaimFormats.length
      || safety.lightEditScopeViolationFormats.length
    ) {
      isLengthRewrite = false
      activePrompt = buildGenerationSafetyRetryPrompt(
        userPrompt,
        parsed,
        targetFormats,
        safety,
        context,
      )
    } else if (methodologyPlan && !goalVerify.ok) {
      isLengthRewrite = false
      const previousOutput = targetFormats
        .map((format) => `===FORMAT:${format}===\n${parsed[format] || ""}`)
        .join("\n\n")
      activePrompt = `${userPrompt}
${buildGoalRewritePromptAppendix(methodologyPlan, goalVerify, previousOutput)}`
    } else if (ipWikiPages && Object.keys(ipWikiPages).length > 0 && !ipCompliance.ok) {
      isLengthRewrite = false
      const previousOutput = targetFormats
        .map((format) => `===FORMAT:${format}===\n${parsed[format] || ""}`)
        .join("\n\n")
      activePrompt = `${userPrompt}
${buildIpWikiComplianceRewritePrompt(ipCompliance)}

前一版输出：
${previousOutput}`
    }
  }

  throw new Error("生成后质检未完成")
}

/**
 * @description 构建内容创作官系统提示词
 * @param agentPrompt - 智能体基础提示词
 * @param context - AIM 生成上下文
 * @returns 完整的系统提示词
 */
export function buildProducerSystemPrompt(agentPrompt: string, context: AimGenerateContext): string {
  const knowledgeUseRule = buildContentProducerKnowledgeRule({
    runtimeTask: context.runtimeTask,
    knowledgeStrategy: context.knowledgeStrategy,
  })
  const creationTraceRule = context.runtimeTask === "light_edit" ? "" : CONTENT_CREATION_TRACE_RULE
  const rawInputText = context.rawInput || ""
  const hasNewsroomAnchors = Boolean(
    getMaterialAnchorsFromTaskSpec(context.taskSpec)
    || rawInputText.includes("内容机会样本锚点")
    || rawInputText.includes("taskSpec.materialAnchors"),
  )
  const newsroomRule = hasNewsroomAnchors && context.runtimeTask !== "light_edit"
    ? NEWSROOM_SAMPLE_CITATION_RULE
    : ""
  const fewshot = buildPromptFewshotBlock(context.runtimeTask, context.targetFormats)
  const progressive = resolveContentProducerProgressiveFlags({
    runtimeTask: context.runtimeTask,
    knowledgeStrategy: context.knowledgeStrategy,
    rawInput: rawInputText,
    hasBenchmarkText: /对标原文|对标文案/.test(rawInputText),
    forGenerate: true,
  })

  // 上下文按优先级：TaskSpec 由 user prompt 注入；IP Wiki / 知识为事实素材；
  // IP 操盘方法论为强参考（结构/钩子/判断标准必须执行）；爆款库仍为弱参考。
  const contextBlocks = [
    context.ipWikiBlock ? `客户 IP 专属档案（仅当前项目，高优先级事实）：\n${context.ipWikiBlock}` : "",
    context.knowledgeBlock ? `当前客户项目知识库（高相关事实条目）：\n${context.knowledgeBlock}` : "",
    context.selectedMethodologyBlock ? `公共指定方法论（强参考，只决定怎么写）：\n${context.selectedMethodologyBlock}` : "",
    context.methodologyBlock
      ? `${METHODOLOGY_INJECTION_PREFACE}\n${context.methodologyBlock}`
      : "",
    context.businessDiagnosisBlock ? `商业诊断方法（弱参考）：\n${context.businessDiagnosisBlock}` : "",
    context.eventStorytellingBlock ? `事件叙事方法：\n${context.eventStorytellingBlock}` : "",
    context.viralStructureBlock ? `爆款结构库（弱参考）：\n${context.viralStructureBlock}` : "",
    fewshot ? `风格对照示例：\n${fewshot}` : "",
  ]

  const taskConstraintExtra = [
    "内部工作流程：",
    "1. 先判断输入内容类型：公众号长文、老板口述、原始文案、客户问题、产品卖点、对标文案或热点选题。",
    "2. 如果用户提供对标文案或爆款文案拆解，先锁定它的核心选题，只学习开头方式、结构节奏、表达密度和转化设计，不照抄具体表达。",
    "3. IP特色、企业知识库、产品卖点和项目案例只能用于替换案例、身份表达、承接动作和语言风格，不能把核心选题改成另一个主题。",
    "4. 如果用户提供公众号长文，优先提炼其中最适合短视频传播的一个核心观点，不要把整篇文章压缩成流水账。",
    "5. 开头必须单独优化：用冲突、反差、痛点、利益或好奇心打开，避免平铺直叙。",
    "6. 正文必须单独优化结构：按问题、判断、案例、行动或反差递进组织，让用户能听懂、能拍摄、能转化。",
    `7. ${knowledgeUseRule}`,
    "8. 如果上下文包含垂类行业热点，只能自然融合和业务相关的部分，禁止硬蹭热点。",
    `9. ${CONTENT_PRODUCER_OPERATING_LOGIC_RULE}`,
    AIM_SESSION_PRIORITY_RULES,
  ].join("\n")

  const qualityRedlines = [
    CONTENT_PRODUCER_REPLY_OPENING,
    "选题优先级：用户明确选题 / 热点选题 / 对标视频核心选题 > IP操盘方法论（强参考：结构/钩子/判断） > 爆款拆解结构 > IP特色和知识库素材。后两者只能服务前者；方法论不得被通用模板绕过。",
    "如果输入是热点选题而不是对标文案，成稿与分析里都不要出现「对标文案」「对标原文」「原视频」这类说法。",
    "开头要具体、有信息量、有冲突或利益点，禁止「今天给大家分享」「很多人不知道」这类空泛起手。",
    "正文每一段都要推进信息，不要堆形容词，不要写营销黑话。",
    "先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。像该 IP 真人说话；跟最近成稿密度对齐。",
    "文案生成必须直接交付成稿，不要反问用户、不要让用户补充资料、不要输出开放式问题。",
    "如果信息不足，只使用用户输入、已确认项目/IP事实和可追溯知识；不得把合理假设写成事实，关键人物、数字、案例或结果缺失时标注「未提供/待补充」或省略。",
    "没有明确来源时，禁止使用「我有个学员/客户/朋友」「我曾经/亲历」来伪造真实案例；改用普遍场景、方法论或明确标注的假设举例。",
    `所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字；这是总上限，不会替代各格式原本该短就短的长度边界。`,
    progressive.includeBenchmark ? `对标改写硬规则：\n${BENCHMARK_REWRITE_GUARDRAIL}` : "",
    creationTraceRule,
    newsroomRule,
  ].filter(Boolean)

  return composeLayeredAimPrompt({
    roleBlock: agentPrompt,
    runtimeTask: context.runtimeTask,
    taskConstraintExtra,
    contextBlocks,
    formatBlock: "请严格按照下方每种格式的要求生成对应内容。每种格式用 ===FORMAT:格式名=== 作为分隔标记。格式细则见用户消息。",
    qualityRedlines,
  })
}

/**
 * @description 构建userprompt
 * @param context - 上下文
 * @param formatBlocks - 格式Blocks
 * @returns string
 */
export function buildUserPrompt(context: AimGenerateContext, formatBlocks: string): string {
  const workflowContext = buildWorkflowContext(context)
  const isLightEdit = context.runtimeTask === "light_edit"
  const passagePolish = isLightEdit && looksLikePassagePolish(context.rawInput || "")

  // 冲突10：light_edit 不需要字数保留规则（只改局部，字数规则无意义）
  const explicitWordCountRule = isLightEdit ? null : buildExplicitWordCountPriorityRule(context.rawInput)

  const knowledgeHint = buildContentProducerKnowledgeRule({
    runtimeTask: context.runtimeTask,
    knowledgeStrategy: context.knowledgeStrategy,
  })
  const contextInstruction = isLightEdit
    ? LIGHT_EDIT_USER_INSTRUCTION
    : `请根据以上内容与任务单，按知识规则生成以下格式的营销内容：\n${knowledgeHint}`

  // 冲突2：light_edit 跳过选题锁定；对标 guardrail 仅 rewrite / 有对标原文时注入
  const includeBenchmarkGuardrail = !isLightEdit && resolveContentProducerProgressiveFlags({
    runtimeTask: context.runtimeTask,
    knowledgeStrategy: context.knowledgeStrategy,
    rawInput: context.rawInput,
    hasBenchmarkText: /对标原文|对标文案/.test(context.rawInput || ""),
    forGenerate: true,
  }).includeBenchmark
  const topicLockBlock = isLightEdit
    ? ""
    : `选题锁定要求：
- 如果用户输入里有热点标题、对标标题、对标原文、爆款拆解或明确选题，必须先锁定其核心选题。
- 企业知识库和IP特色只能作为案例、身份、表达口吻和承接方式融入，不允许把主题改写成知识库里另一个更熟悉的话题。
- 成稿必须让用户一眼看出：这仍然是在讲热点/原选题，只是换成了本IP的表达和承接。
${includeBenchmarkGuardrail ? `- ${BENCHMARK_REWRITE_GUARDRAIL}` : ""}`

  const rawInputBlock = passagePolish
    ? `【待润色原文与要求】（只在此基础上润色，保持相近篇幅，禁止另起长口播/长文）\n"${context.rawInput}"`
    : `用户输入的原始内容：\n"${context.rawInput}"`

  return `${rawInputBlock}

${workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : ""}

${contextInstruction}

${topicLockBlock}

${formatBlocks}

${explicitWordCountRule ? `字数冲突处理：${explicitWordCountRule}\n` : ""}

输出格式要求：
${context.targetFormats.map((format) => `===FORMAT:${format}===\n（在这里输出${format}的内容）`).join("\n\n")}`
}
