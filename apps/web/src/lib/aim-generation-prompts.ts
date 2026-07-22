import { executeGenerateLLM } from "@/lib/aim-agent-model"
import { AIM_OUTPUT_MAX_CHARS, buildExplicitWordCountPriorityRule } from "@/lib/aim-benchmark-length"
import { isBenchmarkCopyTooSimilar } from "@/lib/aim-benchmark-quality"
import {
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_OPERATING_LOGIC_RULE,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
} from "@/lib/aim-agent-prompts"
import type { AimGenerateContext } from "./aim-agent-handlers"
import { parseMultiFormatResponse, type ContentFormat } from "./aim-generator"

const FIRST_PERSON_EVIDENCE_PATTERN = /(?:我有个|我身边有个|我的)(?:学员|客户|朋友|同事|下属)|我给你讲(?:个|一个|件|一件)真事|我们(?:公司|团队)(?:(?:去年|前阵子|之前)\s*)?(?:来|招|遇到|有)(?:了)?(?:个|一个|一位)|我(?:(?:曾经|以前|之前|亲自|亲眼)\s*)?(?:带过|帮过|服务过|辅导过|遇到过|见过|做过|认识)(?:一个|一位|不少|很多|太多|客户|企业|老板|团队|新人)|我(?:观察|接触|辅导|服务|带)(?:了)?(?:太多|很多|不少)(?:学员|客户|(?:职场)?新人|老板|企业|团队)/

export const CONTENT_CREATION_TRACE_RULE = `教学式透明交付规则：
- 每个完整成稿或文章的最前面，先输出 [[AIM_METHOD_NOTE]] ... [[/AIM_METHOD_NOTE]]；正文放在结束标记之后。
- 说明区只给可学习、可复用、可验证的高层结论，不输出逐字内部思维链。
- 说明区固定包含以下四部分：
  1. 「风格定位」：标注主风格与辅助风格（如幽默、专业、感性、犀利、沉稳），并说明与当前场景的关系。
  2. 「教学拆解」：用 3-5 条概括选题判断、开头钩子、结构推进、情绪基调和转化承接的取舍。
  3. 「来源标注」：分别列出“对标爆款视频来源”、“产品卖点”、“人设特点”，每项都写出来源名称与在本稿中的用法。
  4. 「八字与紫微天命适配」：标注引用的八字/紫微资料来源，以及它如何影响文风、用词和情感基调。
- 只能引用当前用户输入、选题上下文、知识库条目和 IP 定位维基中明确存在的来源名称；不得编造来源、视频、卖点、人设或命理结论。
- 任一类资料缺失时，必须在对应位置写“未提供/待补充”；没有八字或紫微资料时，不得把一般性格判断写成命理结论。`

const METHOD_NOTE_PATTERN = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/

function traceEntryTitle(context: AimGenerateContext, pattern: RegExp): string | null {
  const entry = (context.retrievedEntries ?? []).find((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as Record<string, unknown>
    return pattern.test([record.category, record.title, record.content].map(String).join("\n"))
  }) as Record<string, unknown> | undefined
  return entry && typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : null
}

function traceSource(value: string | null | undefined) {
  return value?.trim() || "未提供/待补充"
}

function buildFallbackContentCreationTrace(context: AimGenerateContext): string {
  const productSource = traceEntryTitle(context, /product_usp|product|offer|产品|卖点|服务/)
  const personaSource = traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/)
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

  return `[[AIM_METHOD_NOTE]]
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
[[/AIM_METHOD_NOTE]]`
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
  if (complete) return trimmed
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

/**
 * @description 构建工作流上下文文本（任务单、选题、热点等）
 * @param context - AIM 生成上下文
 * @returns 格式化的工作流上下文文本
 */
export function buildWorkflowContext(context: AimGenerateContext): string {
  const taskSpec = context.taskSpec
  return [
    taskSpec
      ? [
          "本次内容运营任务单：",
          `- 内容目标：${taskSpec.goal}`,
          taskSpec.targetCustomer ? `- 目标客户：${taskSpec.targetCustomer}` : null,
          taskSpec.realProblem ? `- 真实问题：${taskSpec.realProblem}` : null,
          taskSpec.contentTask ? `- 主要内容任务：${taskSpec.contentTask}` : null,
          taskSpec.trustAssetType ? `- 优先信任证据：${taskSpec.trustAssetType}` : null,
          taskSpec.exclusiveEvidence ? `- 专属证据：${taskSpec.exclusiveEvidence}` : null,
          taskSpec.desiredAction ? `- 期望动作：${taskSpec.desiredAction}` : null,
          taskSpec.dealPath ? `- 成交承接：${taskSpec.dealPath}` : null,
          // ── 计划模式扩展字段（必须真实控制输出，不得只作为备注）──
          taskSpec.coreMessage ? `- 核心信息：${taskSpec.coreMessage}` : null,
          taskSpec.platform ? `- 发布平台：${taskSpec.platform}` : null,
          taskSpec.useScenario ? `- 使用场景：${taskSpec.useScenario}` : null,
          taskSpec.outputFormat ? `- 输出格式：${taskSpec.outputFormat}` : null,
          taskSpec.style ? `- 风格：${taskSpec.style}` : null,
          taskSpec.lengthRule ? `- 长度要求：${taskSpec.lengthRule}` : null,
          taskSpec.ctaText ? `- CTA：${taskSpec.ctaText}` : null,
        ].filter(Boolean).join("\n")
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
  const knowledgeUseRule = context.runtimeTask === "light_edit"
      ? "7. 轻改任务只按用户原文、选区和修改要求做局部优化；替换稿只处理用户点名要改的地方，不要顺手替换、删改未点名内容；可以给开头、结构、结尾等简短可选建议，但不要把建议直接写进替换稿；不要主动扩写客户背景、产品卖点或知识库素材。"
      : `7. ${CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE}`
  const lightEditOutputRule = context.runtimeTask === "light_edit"
    ? "\n轻改输出边界：如果用户只要求优化开头/前三秒/第一句话/钩子，输出内容只能是开头候选或开头替换稿，禁止返回整篇文案；如果要求标题只给标题，如果要求结尾只给结尾。"
    : ""
  const creationTraceRule = context.runtimeTask === "light_edit"
    ? ""
    : `\n${CONTENT_CREATION_TRACE_RULE}\n`

  return `${agentPrompt}

${context.knowledgeBlock}
${context.selectedMethodologyBlock}
${context.methodologyBlock}
${context.businessDiagnosisBlock}
${context.viralStructureBlock}
${context.eventStorytellingBlock}
${context.ipWikiBlock ? `${context.ipWikiBlock}\n` : ""}
内部工作流程：
1. 先判断输入内容类型：公众号长文、老板口述、原始文案、客户问题、产品卖点、对标文案或热点选题。
2. 如果用户提供对标文案或爆款文案拆解，先锁定它的核心选题，只学习它的开头方式、结构节奏、表达密度和转化设计，不照抄具体表达。
3. IP特色、企业知识库、产品卖点和项目案例只能用于替换案例、身份表达、承接动作和语言风格，不能把核心选题改成另一个主题。
4. 如果用户提供公众号长文，优先提炼其中最适合短视频传播的一个核心观点，不要把整篇文章压缩成流水账。
5. 开头必须单独优化：用冲突、反差、痛点、利益或好奇心打开，避免平铺直叙。
6. 正文必须单独优化结构：按问题、判断、案例、行动或反差递进组织，让用户能听懂、能拍摄、能转化。
${knowledgeUseRule}
${lightEditOutputRule}
8. 如果上下文包含垂类行业热点，只能自然融合和业务相关的部分，禁止硬蹭热点。
9. ${CONTENT_PRODUCER_OPERATING_LOGIC_RULE}
${creationTraceRule}

创作规则：
- 选题优先级：用户明确选题 / 热点选题 / 对标视频核心选题 > 爆款拆解结构 > IP特色和知识库素材。后两者只能服务前者。
- 如果输入是热点选题而不是对标文案，成稿与分析里都不要出现"对标文案""对标原文""原视频"这类说法。
- 开写前先在内部判断"这一稿到底在讲什么"，成稿全篇都必须围绕这个选题推进。
- 先判断用户输入最适合哪一种开头、文案结构和结尾类型，再开始写。
- 必须把专业结构融进最终文案里；除 [[AIM_METHOD_NOTE]] 中的教学拆解外，正文不要输出「使用了某某结构」这类解释。
- 开头要具体、有信息量、有冲突或利益点，禁止「今天给大家分享」「很多人不知道」这类空泛起手。
- 正文每一段都要推进信息，不要堆形容词，不要写营销黑话。
- 先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
- 保留必要的口语、停顿、重复和语气词；不要为了显得高级主动加金句、宏大比喻或整齐三段式。
- 文案生成必须直接交付成稿，不要反问用户、不要让用户补充资料、不要输出开放式问题。
- 如果信息不足，只使用用户输入、已确认项目/IP事实和可追溯知识；不得把合理假设写成事实，关键人物、数字、案例或结果缺失时标注「未提供/待补充」或省略。
- 没有明确来源时，禁止使用「我有个学员/客户/朋友」「我曾经/亲历」来伪造真实案例；改用普遍场景、方法论或明确标注的假设举例。
- 成稿前做内部质检：是否遵守用户修改意图、是否保留原文有效表达、是否过度调用背景导致跑题、是否有明显 AI 套话；生成模式下不要输出验证结果区块或质检报告，验证结果只在聊天质检场景生效。
- 所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字；这是总上限，不会替代各格式原本该短就短的长度边界。

对标改写硬规则：
${BENCHMARK_REWRITE_GUARDRAIL}

请严格按照下方每种格式的要求，生成对应的内容。每种格式用 ===FORMAT:格式名=== 作为分隔标记。`
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

  // 冲突8：light_edit 覆盖格式说明，明确只输出替换稿/候选
  // 冲突5：非 light_edit 的指令改为"选择性结合"，与 system prompt 的 SELECTIVE_KNOWLEDGE_RULE 一致
  const contextInstruction = isLightEdit
    ? "请只根据用户原文、选区和修改要求做局部优化；替换稿只改用户点名的内容，不要顺手改未点名的开头、工具名、结尾或结构；如果用户只要求优化开头/前三秒/第一句话/钩子，只输出 3-5 个开头候选或一个开头替换稿，禁止输出整篇文案；可以给开头、结构、结尾等简短可选建议，但不要主动结合企业知识库扩写。"
    : "请根据以上内容，按上方规则选择性结合企业知识库素材，生成以下格式的营销内容："

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
