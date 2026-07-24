import { executeGenerateLLM } from "@/lib/aim-agent-model"
import { AIM_OUTPUT_MAX_CHARS, buildExplicitWordCountPriorityRule } from "@/lib/aim-benchmark-length"
import { isBenchmarkCopyTooSimilar } from "@/lib/aim-benchmark-quality"
import {
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_OPERATING_LOGIC_RULE,
  buildContentProducerKnowledgeRule,
} from "@/lib/aim-agent-prompts"
import {
  AIM_INTERNAL_INTENT_GATE,
  AIM_NORTH_STAR_GOAL,
  AIM_SESSION_PRIORITY_RULES,
  LIGHT_EDIT_OUTPUT_BOUNDARY,
  LIGHT_EDIT_USER_INSTRUCTION,
  RUNTIME_TASK_LABELS,
} from "@/lib/aim-intent-boundaries"
import {
  buildKnowledgeCitationMarkdown,
  upsertKnowledgeCitationInMethodNote,
} from "@/lib/aim-knowledge-cite"
import { buildPromptFewshotBlock } from "@/lib/aim-prompt-fewshots"
import { COLLABORATION_MODE_LABELS, type TaskSpec } from "@/lib/task-spec"
import { formatAimTurnIntentBlock, resolveAimTurnIntent } from "@/lib/aim-turn-intent"
import type { AimGenerateContext } from "./aim-agent-handlers"
import { parseMultiFormatResponse, type ContentFormat } from "./aim-generator"

const FIRST_PERSON_EVIDENCE_PATTERN = /(?:我有个|我身边有个|我的)(?:学员|客户|朋友|同事|下属)|我给你讲(?:个|一个|件|一件)真事|我们(?:公司|团队)(?:(?:去年|前阵子|之前)\s*)?(?:来|招|遇到|有)(?:了)?(?:个|一个|一位)|我(?:(?:曾经|以前|之前|亲自|亲眼)\s*)?(?:带过|帮过|服务过|辅导过|遇到过|见过|做过|认识)(?:一个|一位|不少|很多|太多|客户|企业|老板|团队|新人)|我(?:观察|接触|辅导|服务|带)(?:了)?(?:太多|很多|不少)(?:学员|客户|(?:职场)?新人|老板|企业|团队)/

export const CONTENT_CREATION_TRACE_RULE = `教学式透明交付规则：
- 每个完整成稿或文章的最前面，先输出 [[AIM_METHOD_NOTE]] ... [[/AIM_METHOD_NOTE]]；正文放在结束标记之后。
- 说明区只给可学习、可复用、可验证的高层结论，不输出逐字内部思维链。
- 说明区固定包含以下五部分：
  1. 「风格定位」：标注主风格与辅助风格（如幽默、专业、感性、犀利、沉稳），并说明与当前场景的关系。
  2. 「教学拆解」：用 3-5 条概括选题判断、开头钩子、结构推进、情绪基调和转化承接的取舍。
  3. 「来源标注」：分别列出“对标爆款视频来源”、“产品卖点”、“人设特点”，每项都写出来源名称与在本稿中的用法；名称必须来自当前知识块/选题上下文中的真实标题，不得编造。
  4. 「八字与紫微天命适配」：标注引用的八字/紫微资料来源，以及它如何影响文风、用词和情感基调。
  5. 「相关原文」：按知识块中真实命中的条目列出「相关原文见 《标题》（分类）」；没有命中时写“未提供/待补充”。服务端会用实际召回条目覆盖本小节，勿编造条目。
- 只能引用当前用户输入、选题上下文、知识库条目和 IP 定位维基中明确存在的来源名称；不得编造来源、视频、卖点、人设或命理结论。
- 任一类资料缺失时，必须在对应位置写“未提供/待补充”；没有八字或紫微资料时，不得把一般性格判断写成命理结论。
- 禁止把「相关原文见」写进口播/短视频正文；只放在 AIM_METHOD_NOTE 说明区。`

const METHOD_NOTE_PATTERN = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/

function asTraceRecord(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" ? (item as Record<string, unknown>) : null
}

function traceEntryTitle(context: AimGenerateContext, pattern: RegExp, preferredCategory?: string): string | null {
  const entries = (context.retrievedEntries ?? [])
    .map(asTraceRecord)
    .filter((record): record is Record<string, unknown> => Boolean(record))
  const preferred = preferredCategory
    ? entries.find((record) => String(record.category ?? "") === preferredCategory && pattern.test([record.category, record.title, record.content].map(String).join("\n")))
    : undefined
  const entry = preferred ?? entries.find((record) => pattern.test([record.category, record.title, record.content].map(String).join("\n")))
  return entry && typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : null
}

function traceSource(value: string | null | undefined) {
  return value?.trim() || "未提供/待补充"
}

function resolveTraceProductSource(context: AimGenerateContext): string | null {
  return traceEntryTitle(context, /product_usp|product|offer|产品|卖点|服务|陪跑|阶梯/, "product_usp")
    || (/产品阶梯|产品卖点|陪跑|29800|核心交付/.test(context.ipWikiBlock ?? "") ? "IP 定位维基：成交路径与产品阶梯" : null)
}

function patchPlaceholderTraceSources(note: string, context: AimGenerateContext): string {
  let patched = note
  const productSource = resolveTraceProductSource(context)
  if (productSource) {
    patched = patched.replace(/产品卖点：\s*未提供\/待补充/g, `产品卖点：${productSource}`)
  }
  const personaSource = traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/, "positioning_material")
    || traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/)
  if (personaSource) {
    patched = patched.replace(/人设特点：\s*未提供\/待补充/g, `人设特点：${personaSource}`)
  }
  return patched
}

function attachDeterministicCitationNote(noteWithMarkers: string, context: AimGenerateContext): string {
  const citationBlock = buildKnowledgeCitationMarkdown(context.retrievedEntries ?? [])
  const match = noteWithMarkers.match(/^\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]$/)
  if (!match) return noteWithMarkers
  const inner = upsertKnowledgeCitationInMethodNote(
    match[1],
    citationBlock || "### 相关原文\n- 未提供/待补充",
  )
  return `[[AIM_METHOD_NOTE]]\n${inner}\n[[/AIM_METHOD_NOTE]]`
}

function buildFallbackContentCreationTrace(context: AimGenerateContext): string {
  const productSource = resolveTraceProductSource(context)
  const personaSource = traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/, "positioning_material")
    || traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/)
  const baziSource = traceEntryTitle(context, /bazi|八字|四柱|五行/)
    || (/八字|四柱|五行/.test(context.ipWikiBlock) ? "IP 定位维基" : null)
  const ziweiSource = traceEntryTitle(context, /ziwei|紫微|命宫|天命/)
    || (/紫微|命宫|天命/.test(context.ipWikiBlock) ? "IP 定位维基" : null)
  const benchmarkSource = context.topicTitle
    ? `选题上下文：${context.topicTitle}`
    : /对标|爆款|原视频/.test(context.rawInput)
      ? "用户输入中的对标/爆款素材（未识别到独立标题或链接）"
      : null
  const task = context.taskSpec
  const logicSteps = [
    task?.targetCustomer ? `目标客户：${task.targetCustomer}` : "目标客户：按当前输入与 IP 定位校准。",
    task?.contentTask ? `内容任务：${task.contentTask}` : task?.goal ? `内容目标：${task.goal}` : "内容任务：围绕用户本轮明确需求交付。",
    `结构取舍：按 ${(context.targetFormats ?? []).join("、") || "当前格式"} 的成品要求组织钩子、正文和承接。`,
  ]
  const stylePositioning = context.ipWikiBlock || personaSource
    ? "以 IP 定位与人设资料为主，保持专业、清晰与人格一致。"
    : "专业、清晰、可信；完整人设风格待补充。"
  const hasDestiny = Boolean(baziSource || ziweiSource)
  const citationBlock = buildKnowledgeCitationMarkdown(context.retrievedEntries ?? [])
    || "### 相关原文\n- 未提供/待补充"

  return attachDeterministicCitationNote(`[[AIM_METHOD_NOTE]]
### 风格定位
- ${stylePositioning}

### 教学拆解
${logicSteps.map((step) => `- ${step}`).join("\n")}

### 来源标注
- 对标爆款视频来源：${traceSource(benchmarkSource)}
- 产品卖点：${traceSource(productSource)}
- 人设特点：${traceSource(personaSource)}

### 八字与紫微天命适配
- 八字依据：${traceSource(baziSource)}
- 紫微依据：${traceSource(ziweiSource)}
- 风格映射：${hasDestiny ? "现有命理资料已作为文风、用词和情感基调的校准依据。" : "未做命理推断；待补充八字或紫微资料后再校准。"}

${citationBlock}
[[/AIM_METHOD_NOTE]]`, context)
}

/**
 * @description 确保内容包含创作溯源信息
 * @param content - 原始内容文本
 * @param context - AIM 生成上下文
 * @returns 添加溯源信息后的内容
 */
export function ensureContentCreationTrace(content: string, context: AimGenerateContext): string {
  const trimmed = content.trim()
  if (context.runtimeTask === "light_edit") return trimmed
  const existing = trimmed.match(METHOD_NOTE_PATTERN)
  const note = existing?.[0] || ""
  const complete = ["风格定位", "教学拆解", "对标爆款视频来源", "产品卖点", "人设特点", "八字", "紫微"]
    .every((label) => note.includes(label))
  if (complete) {
    const patchedNote = attachDeterministicCitationNote(patchPlaceholderTraceSources(note, context), context)
    return patchedNote === note ? trimmed : trimmed.replace(note, patchedNote)
  }
  const result = existing ? trimmed.replace(existing[0], "").trim() : trimmed
  return `${buildFallbackContentCreationTrace(context)}\n\n${result}`
}

/**
 * @description 查找不支持第一人称案例声明的格式
 * @param context - AIM 生成上下文
 * @param parsed - 解析后的多格式内容
 * @param targetFormats - 目标格式列表
 * @returns 包含无依据第一人称声明的格式数组
 */
export function findUnsupportedFirstPersonClaimFormats(
  context: AimGenerateContext,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
): ContentFormat[] {
  const evidence = [
    context.rawInput,
    context.knowledgeBlock,
    context.ipWikiBlock,
    context.eventStorytellingBlock,
  ].filter(Boolean).join("\n")
  if (FIRST_PERSON_EVIDENCE_PATTERN.test(evidence)) return []

  return targetFormats.filter((format) => FIRST_PERSON_EVIDENCE_PATTERN.test(parsed[format] || ""))
}

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
 * @param systemPrompt - 系统提示词
 * @param userPrompt - 用户提示词
 * @param context - AIM 生成上下文
 * @param targetFormats - 目标格式列表
 * @returns 生成结果（完成响应和解析内容）
 */
export async function executeGenerateLLMWithBenchmarkRetry(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  context: AimGenerateContext,
  targetFormats: ContentFormat[],
) {
  let activePrompt = userPrompt
  const isLightEdit = context.runtimeTask === "light_edit"
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const completion = await executeGenerateLLM(agentId, systemPrompt, activePrompt, context.modelPolicy)
    const parsed = parseMultiFormatResponse(completion.content, targetFormats)
    // light_edit 的目的是保留原文、只做局部优化，跳过抄袭检测以避免误判
    const copiedFormats = isLightEdit
      ? []
      : targetFormats.filter((format) =>
          isBenchmarkCopyTooSimilar(context.rawInput, parsed[format] || "")
        )
    const unsupportedClaimFormats = findUnsupportedFirstPersonClaimFormats(
      context,
      parsed,
      targetFormats,
    )

    if (copiedFormats.length === 0 && unsupportedClaimFormats.length === 0) {
      return { completion, parsed }
    }
    if (attempt === 2) {
      throw new Error("生成结果连续出现无依据的案例或过度近似原文，已停止交付")
    }

    const previousOutput = targetFormats
      .map((format) => `===FORMAT:${format}===\n${parsed[format] || ""}`)
      .join("\n\n")
    const retryReasons = [
      copiedFormats.length
        ? `上一版 ${copiedFormats.join("、")} 与对标原文过于相似，判定为“几乎没改”。`
        : "",
      unsupportedClaimFormats.length
        ? `上一版 ${unsupportedClaimFormats.join("、")} 出现了上下文无依据的“我的学员/客户/朋友/亲历”，判定为事实风险。`
        : "",
    ].filter(Boolean).join("\n")
    activePrompt = `${userPrompt}

【自动质检结果】
${retryReasons}
请重写全部请求格式：保留原选题、结构节奏和目标字数；禁止声称“真事”、“我们公司的人”或“我观察/带过很多人”。无依据的人物案例改为普遍现象、可验证方法或明确写出“假设”的举例。
除专有名词和固定产品名外，不要连续沿用原文 12 个字以上；不要只替换少量词。

上一版输出：
${previousOutput}`
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
  const fewshot = buildPromptFewshotBlock(context.runtimeTask, context.targetFormats)

  // 上下文按优先级：TaskSpec 由 user prompt 注入；此处 IP Wiki > 知识 > 方法论/爆款（弱参考）
  const contextBlocks = [
    context.ipWikiBlock ? `IP 定位维基（高优先级档案）：\n${context.ipWikiBlock}` : "",
    context.knowledgeBlock ? `企业知识库（高相关条目）：\n${context.knowledgeBlock}` : "",
    context.selectedMethodologyBlock ? `指定方法论：\n${context.selectedMethodologyBlock}` : "",
    context.methodologyBlock ? `IP操盘方法论（弱参考）：\n${context.methodologyBlock}` : "",
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

  return composeLayeredAimPrompt({
    roleBlock: agentPrompt,
    runtimeTask: context.runtimeTask,
    taskConstraintExtra,
    contextBlocks,
    formatBlock: "请严格按照下方每种格式的要求生成对应内容。每种格式用 ===FORMAT:格式名=== 作为分隔标记。格式细则见用户消息。",
    qualityRedlines: [
      "选题优先级：用户明确选题 / 热点选题 / 对标视频核心选题 > 爆款拆解结构 > IP特色和知识库素材。后两者只能服务前者。",
      "如果输入是热点选题而不是对标文案，成稿与分析里都不要出现「对标文案」「对标原文」「原视频」这类说法。",
      "开头要具体、有信息量、有冲突或利益点，禁止「今天给大家分享」「很多人不知道」这类空泛起手。",
      "正文每一段都要推进信息，不要堆形容词，不要写营销黑话。",
      "先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。",
      "文案生成必须直接交付成稿，不要反问用户、不要让用户补充资料、不要输出开放式问题。",
      "如果信息不足，只使用用户输入、已确认项目/IP事实和可追溯知识；不得把合理假设写成事实，关键人物、数字、案例或结果缺失时标注「未提供/待补充」或省略。",
      "没有明确来源时，禁止使用「我有个学员/客户/朋友」「我曾经/亲历」来伪造真实案例；改用普遍场景、方法论或明确标注的假设举例。",
      `所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字；这是总上限，不会替代各格式原本该短就短的长度边界。`,
      `对标改写硬规则：\n${BENCHMARK_REWRITE_GUARDRAIL}`,
      creationTraceRule,
    ],
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

  // 冲突10：light_edit 不需要字数保留规则（只改局部，字数规则无意义）
  const explicitWordCountRule = isLightEdit ? null : buildExplicitWordCountPriorityRule(context.rawInput)

  const knowledgeHint = buildContentProducerKnowledgeRule({
    runtimeTask: context.runtimeTask,
    knowledgeStrategy: context.knowledgeStrategy,
  })
  const contextInstruction = isLightEdit
    ? LIGHT_EDIT_USER_INSTRUCTION
    : `请根据以上内容与任务单，按知识规则生成以下格式的营销内容：\n${knowledgeHint}`

  // 冲突2：light_edit 跳过选题锁定和 GUARDRAIL（局部优化不需要对标改写硬规则）
  const topicLockBlock = isLightEdit
    ? ""
    : `选题锁定要求：
- 如果用户输入里有热点标题、对标标题、对标原文、爆款拆解或明确选题，必须先锁定其核心选题。
- 企业知识库和IP特色只能作为案例、身份、表达口吻和承接方式融入，不允许把主题改写成知识库里另一个更熟悉的话题。
- 成稿必须让用户一眼看出：这仍然是在讲热点/原选题，只是换成了本IP的表达和承接。
- ${BENCHMARK_REWRITE_GUARDRAIL}`

  return `用户输入的原始内容：
"${context.rawInput}"

${workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : ""}

${contextInstruction}

${topicLockBlock}

${formatBlocks}

${explicitWordCountRule ? `字数冲突处理：${explicitWordCountRule}\n` : ""}

输出格式要求：
${context.targetFormats.map((format) => `===FORMAT:${format}===\n（在这里输出${format}的内容）`).join("\n\n")}`
}
