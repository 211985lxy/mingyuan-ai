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

export async function executeGenerateLLMWithBenchmarkRetry(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  context: AimGenerateContext,
  targetFormats: ContentFormat[],
) {
  const completion = await executeGenerateLLM(agentId, systemPrompt, userPrompt, context.modelPolicy)
  const parsed = parseMultiFormatResponse(completion.content, targetFormats)
  const copiedFormats = targetFormats.filter((format) => isBenchmarkCopyTooSimilar(context.rawInput, parsed[format] || ""))

  if (copiedFormats.length === 0) return { completion, parsed }

  const previousOutput = targetFormats
    .map((format) => `===FORMAT:${format}===\n${parsed[format] || ""}`)
    .join("\n\n")
  const retryPrompt = `${userPrompt}

【自动质检结果】
上一版 ${copiedFormats.join("、")} 与对标原文过于相似，判定为"几乎没改"。
请重写全部请求格式：保留原选题、结构节奏和目标字数，但必须换成当前 IP 的开头、案例、过渡句、句式和行动引导。
除专有名词和固定产品名外，不要连续沿用原文 12 个字以上；不要只替换少量词。

上一版输出：
${previousOutput}`

  const retryCompletion = await executeGenerateLLM(agentId, systemPrompt, retryPrompt, context.modelPolicy)
  return {
    completion: retryCompletion,
    parsed: parseMultiFormatResponse(retryCompletion.content, targetFormats),
  }
}

export function buildProducerSystemPrompt(agentPrompt: string, context: AimGenerateContext): string {
  const knowledgeUseRule = context.runtimeTask === "light_edit"
      ? "7. 轻改任务只按用户原文、选区和修改要求做局部优化；替换稿只处理用户点名要改的地方，不要顺手替换、删改未点名内容；可以给开头、结构、结尾等简短可选建议，但不要把建议直接写进替换稿；不要主动扩写客户背景、产品卖点或知识库素材。"
      : `7. ${CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE}`
  const lightEditOutputRule = context.runtimeTask === "light_edit"
    ? "\n轻改输出边界：如果用户只要求优化开头/前三秒/第一句话/钩子，输出内容只能是开头候选或开头替换稿，禁止返回整篇文案；如果要求标题只给标题，如果要求结尾只给结尾。"
    : ""

  return `${agentPrompt}

${context.knowledgeBlock}
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

创作规则：
- 选题优先级：用户明确选题 / 热点选题 / 对标视频核心选题 > 爆款拆解结构 > IP特色和知识库素材。后两者只能服务前者。
- 如果输入是热点选题而不是对标文案，成稿与分析里都不要出现"对标文案""对标原文""原视频"这类说法。
- 开写前先在内部判断"这一稿到底在讲什么"，成稿全篇都必须围绕这个选题推进。
- 先判断用户输入最适合哪一种开头、文案结构和结尾类型，再开始写。
- 必须把专业结构融进最终文案里，但不要输出「使用了某某结构」这类解释。
- 开头要具体、有信息量、有冲突或利益点，禁止「今天给大家分享」「很多人不知道」这类空泛起手。
- 正文每一段都要推进信息，不要堆形容词，不要写营销黑话。
- 先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
- 保留必要的口语、停顿、重复和语气词；不要为了显得高级主动加金句、宏大比喻或整齐三段式。
- 文案生成必须直接交付成稿，不要反问用户、不要让用户补充资料、不要输出开放式问题。
- 如果信息不足，只使用用户输入、已确认项目/IP事实和可追溯知识；不得把合理假设写成事实，关键人物、数字、案例或结果缺失时标注「未提供/待补充」或省略。
- 成稿前做内部质检：是否遵守用户修改意图、是否保留原文有效表达、是否过度调用背景导致跑题、是否有明显 AI 套话；除非用户要求，不要输出质检报告。
- 所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字；这是总上限，不会替代各格式原本该短就短的长度边界。

对标改写硬规则：
${BENCHMARK_REWRITE_GUARDRAIL}

请严格按照下方每种格式的要求，生成对应的内容。每种格式用 ===FORMAT:格式名=== 作为分隔标记。`
}

export function buildUserPrompt(context: AimGenerateContext, formatBlocks: string): string {
  const workflowContext = buildWorkflowContext(context)
  const explicitWordCountRule = buildExplicitWordCountPriorityRule(context.rawInput)
  const contextInstruction = context.runtimeTask === "light_edit"
    ? "请只根据用户原文、选区和修改要求做局部优化；替换稿只改用户点名的内容，不要顺手改未点名的开头、工具名、结尾或结构；如果用户只要求优化开头/前三秒/第一句话/钩子，只输出 3-5 个开头候选或一个开头替换稿，禁止输出整篇文案；可以给开头、结构、结尾等简短可选建议，但不要主动结合企业知识库扩写。"
    : "请根据以上内容，结合企业知识库中的相关信息，生成以下格式的营销内容："

  return `用户输入的原始内容：
"${context.rawInput}"

${workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : ""}

${contextInstruction}

选题锁定要求：
- 如果用户输入里有热点标题、对标标题、对标原文、爆款拆解或明确选题，必须先锁定其核心选题。
- 企业知识库和IP特色只能作为案例、身份、表达口吻和承接方式融入，不允许把主题改写成知识库里另一个更熟悉的话题。
- 成稿必须让用户一眼看出：这仍然是在讲热点/原选题，只是换成了本IP的表达和承接。
- ${BENCHMARK_REWRITE_GUARDRAIL}

${formatBlocks}

${explicitWordCountRule ? `字数冲突处理：${explicitWordCountRule}\n` : ""}

输出格式要求：
${context.targetFormats.map((format) => `===FORMAT:${format}===\n（在这里输出${format}的内容）`).join("\n\n")}`
}
