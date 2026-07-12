/**
 * AIM 共享 Prompt 规则与 helper（阶段 3.2 从 aim-agent-handlers.ts 抽出）。
 *
 * 集中存放被多个 agent 复用的提示规则常量与上下文/重试 helper。此前这些定义
 * 内联在 aim-agent-handlers.ts；抽出后 agents/ 各模块可直接 import，不必反向
 * 依赖编排层。归属依据：Explore 依赖报告（真正被多 agent 共享的部分）。
 *
 * 内容逐字搬迁，无行为变化。
 */

import { executeGenerateLLM } from "@/lib/aim-agent-model"
import { parseMultiFormatResponse } from "@/lib/aim-generator"
import type { ContentFormat } from "@/lib/aim-generator"
import { isBenchmarkCopyTooSimilar } from "@/lib/aim-benchmark-quality"
import type { AimGenerateContext } from "./agent-types"

export const BENCHMARK_REWRITE_GUARDRAIL = [
  "对标文案只能借选题、结构节奏和情绪推进，不能贴着原句改。",
  "最终稿必须至少 30% 可感知重写：开头、案例、过渡句、行动引导至少两类要重写成当前 IP 的说法。",
  "除专有名词和固定产品名外，不要连续沿用原文 12 个字以上。",
].join("\n")

export const PUBLISH_PACKAGE_CHAT_RULE = [
  "如果用户在聊天框里要求发布文案、发布话题、发布标题、发布包、标签或话题标签，直接在当前聊天回复里给到，不新增卡片、不要求用户跳页面。",
  "如果用户只是说“写一个发布文案”“给我一个发布文案”“配一个发布文案”这类单一诉求，没有同时要标题、话题或发布包，默认只输出一条精简版发布文案，直接给结果，不展开成整套发布包。",
  "优先基于最近一版成稿生成发布信息；如果上下文里有对标标题、对标原文、爆款拆解或结构化拆解，要先给出对标发布信息，并让发布标题、发布文案和话题风格与对标基本一致，但不要照抄原标题、原句或原话题组合。",
  "对标发布信息必须包含：对标标题、对标话题/标签风格；没有明确内容时写未提供/待补充。",
  "发布文案必须短于原稿，默认输出精简版，压到适合抖音发布页直接粘贴的长度；除非用户明确要求长版，否则不要写成接近原文长度的复述稿。",
  "发布文案只写成品，不解释创作思路；分段要整齐，优先短句和短段，避免大段堆叠。",
  "发布文案默认控制在 6-10 行内，每行 1-2 句；不要输出长篇大论，不要把原稿几乎原样再说一遍。",
  "发布话题推荐 6 个，默认输出 6 个；如果信息不足，可以少于 6 个，但不要超过 6 个。",
  "第 1 个发布话题必须是账号名称、品牌名称、IP 名或项目名相关的话题；如果上下文没有明确名称，用当前 IP/公司/项目信息推断，仍无法判断时写 #品牌名待补充。",
  "其余发布话题只保留和内容强相关的话题，优先选择创业、赚钱、长期主义、低谷期、认知、行业词等核心标签，不要泛滥堆标签。",
  "如果用户要的是整套发布信息，固定输出结构：## 对标发布信息、## 发布标题、## 发布文案、## 发布话题、## 发布前提醒。",
  "对标发布信息里没有明确内容时写未提供/待补充，不要编造对标账号、对标标题或真实平台数据。",
].join("\n")

export const AIM_HIGH_RISK_LOOP_RULE = [
  "高风险任务验证规则：只在正式交付场景生效，包括定位方案、生意系统体检、100 条选题库、会议纪要资产包、天命全案、完整成稿、发布包、获客文案、小红书图文方案、置顶视频脚本、正式质检报告。",
  "简单问答、局部润色、单句改写、纯发散创意、框架阶段或追问阶段，不要追加“验证结果”区块，避免把回复做重。",
  "命中正式交付场景时，先按内部成功标准组织输出，确认内容有没有围绕当前任务、有没有脱离用户原意、有没有把背景素材用错位置。",
  "缺失事实统一写“未提供/待补充”，禁止补编案例、数据、来源、命理结论、对标信息或用户没给出的关键背景。",
  "正式交付内容里必须让读者看出：哪些判断来自当前输入、知识库或上下文，哪些地方仍然缺依据；不要扩展成新的复杂模板。",
  "正式交付内容结尾追加一个简短“验证结果”区块，只允许包含三类信息：已确认什么、待补什么、下一步最小动作。",
].join("\n")

export const CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE = [
  "默认不要每次都重度结合企业知识库。",
  "只有在用户明确要求、当前任务确实需要承接业务信息，或缺少必要的人设/产品/案例支撑时，才少量调用知识库素材。",
  "知识库素材只做点到为止的补位：优先带 1-2 句人设、一个案例、一个产品卖点或一个客户场景，不要整段灌进去。",
  "如果用户已经给够了表达、人设或正文素材，就优先按用户原文完成，不要为了“结合知识库”把稿子写重、写散、写跑题。",
].join("\n")

export function buildChatContextBlock(params: {
  knowledgeBlock: string
  conversationBlock?: string
}) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

export function buildWorkflowContext(context: AimGenerateContext): string {
  return [
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
 * 生成并自动质检对标相似度：首版过于贴近对标原文时，自动重写一版。
 * content_producer 与 deep_copywriter 共享。
 */
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
