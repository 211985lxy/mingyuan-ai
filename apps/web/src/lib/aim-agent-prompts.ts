import { AIM_OUTPUT_MAX_CHARS } from "@/lib/aim-benchmark-length"
import {
  AIM_NORTH_STAR_GOAL,
  AIM_SESSION_PRIORITY_RULES,
  LIGHT_EDIT_OUTPUT_BOUNDARY,
} from "@/lib/aim-intent-boundaries"
import type { AimRuntimeTask, ResolvedKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"
import {
  CONTENT_PRODUCER_OPERATING_LOGIC_CHAT_LINE,
  METHODOLOGY_INJECTION_PREFACE,
} from "@/lib/methodology/methodology-injection-preface"
import {
  resolveContentProducerProgressiveFlags,
  type ContentProducerProgressiveFlags,
} from "@/lib/aim/progressive-prompt-flags"
import { stripViralToolkitFromMethodology } from "@/lib/ip-copywriting-methodology"
import { AIM_ASSISTANT_PERSONA } from "@/lib/aim/assistant-persona"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"
import type { ContentFormat } from "./aim-generator"

export type { ContentProducerProgressiveFlags }
export { resolveContentProducerProgressiveFlags }

export interface ContentProducerChatPromptParams {
  conversationBlock?: string
  knowledgeBlock: string
  methodologyBlock: string
  ipWikiBlock: string
  /** ADR-002：本次指定命名方法论（独立块，未选择时为空串）。 */
  selectedMethodologyBlock?: string
  /** 任务单上下文（由 buildWorkflowContext 生成，可截断） */
  workflowContext?: string
  runtimeTask?: AimRuntimeTask
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  /** IP 方法论动态选卡计划（目标模糊时可追问） */
  methodologyPlan?: import("@/lib/methodology/resolve-copy-methodology-plan").CopyMethodologyPlan
  /** 本轮用户原文，用于推断发布包等渐进块 */
  rawInput?: string
  contentAction?: string | null
  hasBenchmarkText?: boolean
  includePublishPackage?: boolean
  includeHighRisk?: boolean
  includeBenchmark?: boolean
  includeOperatingLogicFull?: boolean
}
function buildChatContextBlock(params: Pick<ContentProducerChatPromptParams, "conversationBlock" | "knowledgeBlock">) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

export const BENCHMARK_REWRITE_GUARDRAIL = [
  "对标文案只能借选题、结构节奏和情绪推进，不能贴着原句改。",
  "最终稿必须至少 30% 可感知重写：开头、案例、过渡句、行动引导至少两类要重写成当前 IP 的说法。",
  "除专有名词和固定产品名外，不要连续沿用原文 12 个字以上。",
  "如果用户一次提供 5-10 篇样本文案，将它们视为同一个风格样本集：先在内部归纳反复出现的开头方式、结构节拍、句式长短、情绪张力、案例用法和结尾习惯，再生成一篇新内容。",
  "多篇样本复刻要学习共同规律，不要逐篇摘要、拼接段落或平均混合原句；样本中的人物、客户案例、个人经历、数据和结果不得移植成用户的真实经历。",
  "除非用户要求看风格拆解，否则只交付复刻风格后的全新成稿，不输出内部分析过程。",
].join("\n")

export const PUBLISH_PACKAGE_CHAT_RULE = [
  "如果用户在聊天框里要求发布文案、发布话题、发布标题、发布包、标签或话题标签，直接在当前聊天回复里给到，不新增卡片、不要求用户跳页面。",
  "如果用户只是说“写一个发布文案”“给我一个发布文案”“配一个发布文案”这类单一诉求，没有同时要标题、话题或发布包，默认只输出一条精简版发布文案，直接给结果，不展开成整套发布包。",
  "优先基于最近一版成稿生成发布信息；如果上下文里有对标标题、对标原文、爆款拆解或结构化拆解，要先给出对标发布信息，并让发布标题、发布文案和话题风格与对标基本一致，但不要照抄原标题、原句或原话题组合。",
  "对标发布信息必须包含：对标标题、对标话题/标签风格；没有明确内容时写未提供/待补充。",
  "发布文案必须短于原稿，默认输出精简版，压到适合抖音发布页直接粘贴的长度；除非用户明确要求长版，否则不要写成接近原文长度的复述稿。",
  "发布文案只写成品，不解释创作思路；分段要整齐，优先短句和短段，避免大段堆叠；用户没提行数时不设固定行数门槛。",
  "发布话题数量只服从用户明确要求；用户指定几个就给几个。用户没指定时按内容需要给出（通常 3-6 个），不设固定数量。",
  "用户没指定时可以包含 1 个账号名称、品牌名称、IP 名或项目名相关的话题；上下文没有明确名称时不要编造，可写 #品牌名待补充。",
  "其余发布话题只保留和内容强相关的话题，不要泛滥堆标签。",
  "如果用户要的是整套发布信息，固定输出结构：## 对标发布信息、## 发布标题、## 发布文案、## 发布话题、## 发布前提醒。",
  "对标发布信息里没有明确内容时写未提供/待补充，不要编造对标账号、对标标题或真实平台数据。",
].join("\n")

export const AIM_HIGH_RISK_LOOP_RULE = [
  "高风险任务验证规则：只在正式交付场景生效，包括定位方案、生意系统体检、100 条选题库、会议纪要资产包、天命全案、完整成稿、发布包、获客文案、小红书图文方案、置顶视频脚本、正式质检报告。",
  "简单问答、局部润色、单句改写、纯发散创意、框架阶段或追问阶段，不要追加“验证结果”区块，避免把回复做重。",
  "命中正式交付场景时，先按内部成功标准组织输出，确认内容有没有围绕当前任务、有没有脱离用户原意、有没有把背景素材用错位置。",
  "缺失事实统一写“未提供/待补充”，禁止补编案例、数据、来源、命理结论、对标信息或用户没给出的关键背景。",
  "正式交付内容里必须让读者看出：哪些判断来自当前输入、知识库或上下文，哪些地方仍然缺依据；不要扩展成新的复杂模板。",
  "验证结论绝不进正文：已确认什么、待补什么、下一步最小动作这类验证信息只写进 [[AIM_METHOD_NOTE]] 说明区（思考依据），成稿正文保持可发布纯净。",
].join("\n")

/** 兼容旧引用：默认轻量知识策略文案 */
export const CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE = [
  "默认不要每次都重度结合企业知识库。",
  "只有在用户明确要求、当前任务确实需要承接业务信息，或缺少必要的人设/产品/案例支撑时，才少量调用知识库素材。",
  "知识库素材只做点到为止的补位：优先带 1-2 句人设、一个案例、一个产品卖点或一个客户场景，不要整段灌进去。",
  "如果用户已经给够了表达、人设或正文素材，就优先按用户原文完成，不要为了“结合知识库”把稿子写重、写散、写跑题。",
].join("\n")

/**
 * 任务感知的知识库调用规则：按 runtimeTask + knowledgeStrategy 分支。
 */
export function buildContentProducerKnowledgeRule(input: {
  runtimeTask?: AimRuntimeTask
  knowledgeStrategy?: ResolvedKnowledgeStrategy
}): string {
  const { runtimeTask, knowledgeStrategy } = input
  if (runtimeTask === "light_edit") {
    return "轻改任务禁止主动扩写企业知识库；只按用户原文、选区和修改要求做局部优化。"
  }
  if (knowledgeStrategy === "hot_topic") {
    return [
      "热点优先：先锁热点与选题，知识库/IP 资料只做承接身份、案例和行动引导。",
      "禁止硬蹭无关热点；找不到真实关联时放弃热点强行植入。",
    ].join("\n")
  }
  if (runtimeTask === "rewrite_copy" || knowledgeStrategy === "rewrite") {
    return [
      "对标/重写任务允许中量调用知识库：优先替换身份表达、案例、产品卖点和承接动作。",
      "知识库素材只服务原选题，不允许把主题改写成知识库里另一个更熟悉的话题。",
      "优先带 1-2 句人设、一个可追溯案例或卖点，不要整段灌进去。",
    ].join("\n")
  }
  if (
    knowledgeStrategy === "conversion"
    || knowledgeStrategy === "persona"
    || knowledgeStrategy === "deep"
  ) {
    return [
      "转化/人设/深度任务必须落地档案：至少写入 1 个目标客户可对号入座的场景，以及 1 条来自 IP Wiki 或知识库的可追溯卖点/案例/过程证据。",
      "做不到时在对应位置标注「未提供/待补充」，禁止编造第一人称学员/客户经历。",
      "知识库点到为止，服务选题推进，不要整段粘贴或跑题扩写。",
    ].join("\n")
  }
  return CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE
}

export const CONTENT_PRODUCER_OPERATING_LOGIC_RULE = [
  "文案本身必须承载内容运营逻辑，但只在内部完成判断，最终不要输出运营分析、模板名称或写作步骤。",
  "开写前锁定五件事：一个目标客户、一个真实问题、一个主要内容任务、一个可信证据、一个承接动作；一篇文案不要同时承担多个主任务。",
  "内容任务不同，正文重心必须不同：吸引目标客户要先制造停留和转发理由；建立专业信任要用过程、案例、边界或专业判断；推动咨询行动要让读者认出自己的问题，并给低门槛下一步；促进成交要讲清适合谁、不适合谁、为什么值得现在行动。",
  "正文默认按自然叙事完成：开头给停留理由，接着还原具体问题或场景，再给鲜明判断，用事实、案例、过程或方法建立可信度，最后自然落到下一步动作。不要机械输出这些环节标题。",
  "每一段都要承担一个作用：留人、共鸣、解释、证明、筛选或承接。不能说明问题、增强信任或推动行动的段落就删掉。",
  "行动引导的强度要匹配内容任务：曝光内容轻承接，信任内容邀请继续关注或查看案例，获客内容引导评论/私信/领取资料，成交内容才引导预约诊断或进一步咨询。",
  "没有真实案例、数据或客户反馈时不要编造证据；改用可验证的方法、过程和判断边界支撑内容。",
].join("\n")

/** 文案创作对外回复的固定承接：先回「好的老板」，再给正文 */
export const CONTENT_PRODUCER_REPLY_OPENING =
  "每次回复第一句先写「好的老板」，再直接给内容或追问；禁止「您好/很高兴为您服务/感谢咨询」这类空客套，也不要堆叠寒暄。"

/**
 * @description 构建内容创作官对话提示词
 * @param params - 提示词参数（上下文块、方法论、IP Wiki 等）
 * @returns 内容创作官对话提示词文本
 */
export function buildContentProducerChatPrompt(params: ContentProducerChatPromptParams): string {
  const contextBlock = buildChatContextBlock(params)
  const knowledgeRule = buildContentProducerKnowledgeRule({
    runtimeTask: params.runtimeTask,
    knowledgeStrategy: params.knowledgeStrategy,
  })
  const lightEditBlock = params.runtimeTask === "light_edit" ? `\n${LIGHT_EDIT_OUTPUT_BOUNDARY}\n` : ""
  const goalClarify =
    params.methodologyPlan?.businessGoal === "unclear" && (params.methodologyPlan.confidence ?? 0) < 0.6
      ? `\n目标确认（仅当目标仍模糊时，最多追问 1 题 + 下列选项，不要开放追问）：\n这条内容更想达成哪个目标？\nA. 获客线索（留资/私信/预约诊断）\nB. 成交转化（报名/购买）\nC. 人设信任（来时路/专业可信）\nD. 品牌曝光（起号/流量/品宣）\n`
      : ""

  const inferred = resolveContentProducerProgressiveFlags({
    runtimeTask: params.runtimeTask,
    knowledgeStrategy: params.knowledgeStrategy,
    rawInput: params.rawInput,
    contentAction: params.contentAction,
    hasBenchmarkText: params.hasBenchmarkText,
    forGenerate: false,
  })
  const flags: ContentProducerProgressiveFlags = {
    includePublishPackage: params.includePublishPackage ?? inferred.includePublishPackage,
    includeHighRisk: params.includeHighRisk ?? inferred.includeHighRisk,
    includeBenchmark: params.includeBenchmark ?? inferred.includeBenchmark,
    includeOperatingLogicFull: params.includeOperatingLogicFull ?? false,
    includeViralToolkit: inferred.includeViralToolkit,
  }

  const progressiveBlocks = [
    flags.includeHighRisk ? AIM_HIGH_RISK_LOOP_RULE : "",
    flags.includeBenchmark
      ? `若涉及对标改写，遵守：\n${BENCHMARK_REWRITE_GUARDRAIL}`
      : "",
    flags.includePublishPackage
      ? `若整理发布信息，遵守：\n${PUBLISH_PACKAGE_CHAT_RULE}`
      : "",
  ].filter(Boolean)

  // 专家技能包按需注入：未命中意图时剥离爆款开头库/19条法则等，只保留 DB 方法论。
  const effectiveMethodology = flags.includeViralToolkit
    ? params.methodologyBlock
    : stripViralToolkitFromMethodology(params.methodologyBlock)

  const methodologySection = effectiveMethodology
    ? `${params.selectedMethodologyBlock ? `${params.selectedMethodologyBlock}\n` : ""}${METHODOLOGY_INJECTION_PREFACE}\n${effectiveMethodology}`
    : params.selectedMethodologyBlock || ""

  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentProducerChat).content,
    {
      persona: AIM_ASSISTANT_PERSONA,
      northStarGoal: AIM_NORTH_STAR_GOAL,
      contextBlock,
      workflowBlock: params.workflowContext ? `\n工作流任务单：\n${params.workflowContext}\n` : "",
      methodologySection,
      ipWikiBlock: params.ipWikiBlock ? `\n客户 IP 专属档案（仅当前项目）：\n${params.ipWikiBlock}` : "",
      lightEditBlock,
      goalClarify,
      progressiveBlocks: progressiveBlocks.length ? `${progressiveBlocks.join("\n\n")}\n` : "",
      replyOpening: CONTENT_PRODUCER_REPLY_OPENING,
      knowledgeRule,
      sessionPriorityRules: AIM_SESSION_PRIORITY_RULES,
      operatingLogic: flags.includeOperatingLogicFull
        ? CONTENT_PRODUCER_OPERATING_LOGIC_RULE
        : CONTENT_PRODUCER_OPERATING_LOGIC_CHAT_LINE,
    },
  )
}

export interface ContentProducerPromptFootprint {
  alwaysOnChars: number
  progressiveChars: number
  total: number
  flags: ContentProducerProgressiveFlags
}

/**
 * 测量内容创作官 chat 提示中 always-on vs progressive 字符占比（不含动态上下文块）。
 */
export function measureContentProducerPromptFootprint(opts?: {
  flags?: Partial<ContentProducerProgressiveFlags>
  runtimeTask?: AimRuntimeTask
  knowledgeStrategy?: ResolvedKnowledgeStrategy
}): ContentProducerPromptFootprint {
  const flags: ContentProducerProgressiveFlags = {
    includePublishPackage: false,
    includeHighRisk: false,
    includeBenchmark: false,
    includeOperatingLogicFull: false,
    includeViralToolkit: false,
    ...opts?.flags,
  }
  const alwaysOnPrompt = buildContentProducerChatPrompt({
    knowledgeBlock: "",
    methodologyBlock: "",
    ipWikiBlock: "",
    runtimeTask: opts?.runtimeTask,
    knowledgeStrategy: opts?.knowledgeStrategy,
    includePublishPackage: false,
    includeHighRisk: false,
    includeBenchmark: false,
    includeOperatingLogicFull: false,
  })
  const withFlags = buildContentProducerChatPrompt({
    knowledgeBlock: "",
    methodologyBlock: "",
    ipWikiBlock: "",
    runtimeTask: opts?.runtimeTask,
    knowledgeStrategy: opts?.knowledgeStrategy,
    ...flags,
  })
  return {
    alwaysOnChars: alwaysOnPrompt.length,
    progressiveChars: Math.max(0, withFlags.length - alwaysOnPrompt.length),
    total: withFlags.length,
    flags,
  }
}

// ─── 格式指令常量（正文在 prompt 注册表，这里只做 key 映射）──────────

function formatInstruction(key: string): string {
  return promptRegistry.get(key).content
}

/**
 * @description 构建小红书图文视觉导演指令
 * @returns 小红书图文视觉方案提示词
 */
export function buildXhsVisualDirectorInstruction(): string {
  return formatInstruction(PROMPT_KEYS.formatXiaohongshuPost)
}

export const FORMAT_INSTRUCTIONS: Record<ContentFormat, string> = {
  video_script: formatInstruction(PROMPT_KEYS.formatVideoScript),
  wechat_article: formatInstruction(PROMPT_KEYS.formatWechatArticle),
  moments_post: formatInstruction(PROMPT_KEYS.formatMomentsPost),
  community_message: formatInstruction(PROMPT_KEYS.formatCommunityMessage),
  raw_copy: formatInstruction(PROMPT_KEYS.formatRawCopy),
  shooting_brief: formatInstruction(PROMPT_KEYS.formatShootingBrief),
  // 仅用于读取旧请求和历史结果；新生成会统一归一到 video_script。
  koubo_script: formatInstruction(PROMPT_KEYS.formatVideoScript),
  xiaohongshu_post: formatInstruction(PROMPT_KEYS.formatXiaohongshuPost),
}
