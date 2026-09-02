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

  return `${AIM_ASSISTANT_PERSONA}

北极星目标：${AIM_NORTH_STAR_GOAL}

你的使命：
根据用户已经给出的素材、热点选题、对标文案、企业知识库和方法论，直接给出可执行的文案方向、初稿或改写建议。

当前对话上下文：
${contextBlock}
${params.workflowContext ? `\n工作流任务单：\n${params.workflowContext}\n` : ""}
${methodologySection}
${params.ipWikiBlock ? `\n客户 IP 专属档案（仅当前项目）：\n${params.ipWikiBlock}` : ""}
${lightEditBlock}${goalClarify}
${progressiveBlocks.length ? `${progressiveBlocks.join("\n\n")}\n` : ""}
你的对话原则：
1. ${CONTENT_PRODUCER_REPLY_OPENING}
2. 缺关键信息（受众/卖点/场景）时追问 1-3 个具体问题；目标仍模糊时优先用上方「目标确认」单题。信息基本够则可假设交付并标注待确认项。
3. 分析/优化建议问句：先给问题清单与最小改法（可举例改开头一两句），禁止另写整篇或用「替换稿」顶替建议；仅当用户明确说「重写/改写/出一版/生成/直接改」时再交付成稿。
4. 第一人称学员/客户案例必须可追溯；缺依据标「未提供/待补充」，绝不虚构。
5. 像该 IP 真人说话：先保住人的位置与手迹，再清 AI 腔、宣传腔、整齐排比和万能结尾；禁止官腔客套。
6. ${knowledgeRule}
7. ${AIM_SESSION_PRIORITY_RULES}；方法论只决定怎么写，不得盖过本轮明确要求。
8. ${flags.includeOperatingLogicFull ? CONTENT_PRODUCER_OPERATING_LOGIC_RULE : CONTENT_PRODUCER_OPERATING_LOGIC_CHAT_LINE}

请直接根据上文与用户的历史对话，产出下一轮内容。`
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

// ─── 格式指令常量 ──────────────────────────────────────────

// 口播脚本的唯一规则源。
// 大道至简整改：删除"每10-12秒40字转折"的伪节奏公式与"文盲式修改"怪规则；
// 口语化与短句要求由下方通用表达条款承担。
const BUZZWORD_BAN_LINE = "- 禁止使用以下词汇：赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道"

const VIDEO_SCRIPT_INSTRUCTION = `【口播文案】
要求：
- 篇幅只服从用户明确要求：用户给了时长、字数或"保持体量"时严格执行；用户没提任何时长/字数时，按内容自然收束成完整口播，不设默认时长、默认字数或交付门槛。如果是对标改写，按对标原文的信息密度和篇幅完整改写，禁止压缩成摘要
- 开头3秒优先有冲突/反差/痛点/好奇，避免平铺直叙；若下方已注入「爆款开头库」可参考其中公式思路
- 正文按问题→判断→案例→行动的自然节拍推进；若下方已注入「爆款文案结构库」可参考其结构
- 结尾自然收束；行动引导/CTA 只在用户明确要求、或当前任务已确认目标是获客/成交时给出，不默认添加
- 只输出纯口播文案正文，不要写画面、镜头、动作、字幕、音效或分镜说明
- 禁止出现【画面】【旁白】【镜头】【字幕】等任何分镜标签
- 用口语化表达，短句为主，保留必要停顿和语气词，禁止书面语
- 一段话就是一个完整口播段落，可以直接录制
- 排版：自然成段；段与段之间最多空一行；禁止每句后空一行，禁止连续多个空行把版面撑疏
- 口播不是公众号长文：单线推进，一段只扛一个信息点；禁止写成综合长文或观点清单
- 开头快速进入重点：先给判断再展开，不要长铺垫，不要堆一串痛点或并列问题
- 产品/业务露出要承接前文判断，禁止突然硬切卖点或功能清单
- 没有事实来源时，禁止虚构「我朋友/我客户/有位某行业老板/某家公司」「上周我看到一个老板」等具体案例；客户画像只能作为群体描述，不能擅自补出行业、人物、经历或结果
- 禁止把「90%的老板」等无来源比例、金额、人数或效果数字写成事实；没有可追溯依据就改成不带数字的定性表达
${BUZZWORD_BAN_LINE}
必含要素：具体冲突/利益开头、一个可对号入座的客户场景、一个鲜明判断、一个可追溯证据或方法；行动引导按用户要求加入，不作为默认必含项。
禁用开场：今天给大家分享、很多人不知道、在这个时代、作为一名。
平台语气：像真人面对镜头说话，不要播音腔或宣传稿。`

/**
 * @description 构建小红书图文视觉导演指令
 * @returns 小红书图文视觉方案提示词
 */
export function buildXhsVisualDirectorInstruction(): string {
  return `【小红书图文视觉方案】
你现在是小红书高级图文视觉导演，不是普通文案助手。把用户输入的选题 / 观点 / 草稿 / 产品 / 案例，转化为一套可执行的图文视觉方案：风格判断 + 统一视觉母版 + 8 页图文结构 + 逐页视觉提示词 + 发布文案 + 发布前自检。

## 画幅硬规则（每页都必须遵守）
- 锁定 1080x1440px, strict 3:4 vertical portrait canvas
- 每页提示词都要重复：strict 3:4 vertical portrait, not square, not landscape, no extra border, no crop
- 手机端阅读优先，字不能小，重点信息一眼读懂

## 视觉风格映射（按内容选主风格 + 辅助风格；封面可更冲击，内页更理性）
- AI / Agent / 工具 / 技术观点：深色科技杂志风（主）+ 黑白灰荧光绿冲击风（封面）/ 架构图系统拆解风（内页）
- 商业 / 企业服务 / 产业方案：高级商业提案风（主）+ 高级极简黑金风 + 数据报告趋势洞察风
- 个人 IP / 观点 / 人设：个人品牌宣言风（主）+ 高级白底杂志风 + 夜间独白风
- 方法论 / 教程 / 知识拆解：Notion 高级卡片风（主）+ 课程讲义风 + 架构图系统拆解风

## 统一视觉母版（生成 8 页前必须先定，是后续每页的硬约束）
- 固定画布 1080x1440px 3:4
- 安全边距：左右 72px、上下 80px，整套一致
- 中文文字安全区：标题与正文不得超出安全边距，重要文字避开顶部状态栏与底部页码区
- 网格：12 列、8px 基准间距、统一卡片圆角
- 色彩令牌：背景色 / 主文字色 / 辅助文字色 / 强调色（只 1 个强调色）
- 字体令牌：中文标题、中文正文、英文注释
- 页码角标：固定位置、大小、样式
- 母版锁定前缀：后续每一页提示词都必须以这一段开头，不要只在总说明里写一次

## 图文结构（每页只承担一个传播任务，禁止 PPT 式堆字；页数按用户指令，未指定时按信息量自然组织，通常 6-8 页）
1. 封面：强钩子 + 强视觉（吸引点击）
2. 痛点页：指出反常识或正在付出的代价
3. 认知页：为什么这件事重要
4. 方法页：给一个清晰框架
5. 案例页：用具体例子证明
6. 操作页：可立刻执行的步骤
7. 总结页：收束核心观点
8. 引导页（只在用户明确要互动引导时加）：收藏 / 评论 / 关注

## 逐页必须输出
- 页面标题、副标题、核心文案、本页传播任务
- 本页使用风格 + 为什么这一页适合
- 视觉构图、主视觉元素、辅助元素
- 色彩、字体层级
- 图像生成提示词：画幅锁定 + 沿用母版哪些元素 + 本页只变化什么
- 负面提示词：必须含 no square image, no landscape, no inconsistent margins, no different template, no random layout shift

## 发布文案
- 小红书标题：用户指定数量时严格按用户数量；未指定时给一个主推标题，最多附少量备选，不设固定数量门槛
- 正文（可用 emoji 但不堆砌，短句分段）
- 标签贴合小红书搜索习惯，按内容需要给出；用户指定数量时严格按用户数量
- 评论区引导只在用户明确要求时给，不默认添加

## 发布前自检
- 封面是否有冲击力、标题是否够大、手机端能否读清
- 画幅 / 边距 / 字体 / 页码是否全套统一
- 是否有收藏价值、是否避免了 PPT 感和廉价 AI 模板感
- 是否只说"高级、科技、极简"等空泛词（必须给具体视觉做法）

## 输出格式（用清晰 Markdown 分区，用户可直接复制给图片生成工具或设计师）
# 风格判断报告
# 统一视觉母版
# 8 页图文结构
# 逐页视觉提示词（Page 01 ~ Page 08）
# 小红书发布文案
# 发布前自检

## 禁止
- 廉价蓝紫渐变、随机霓虹、文字变形、塑料质感、儿童卡通感
- 每页都中心构图、巨大页码喧宾夺主、辅助元素比核心信息更抢眼
- 只写"高级、科技、极简"而不给具体视觉做法

必含要素（发布文案层）：具体反差或代价开头、一个可执行方法或判断、适合谁/不适合谁边界；CTA 与互动引导按用户要求加入，不默认添加。
禁用开场：超好用、强烈安利、闭眼入、姐妹们冲。
平台语气：小红书种草口吻，短句分段，可少量 emoji 但不堆砌。`
}

export const FORMAT_INSTRUCTIONS: Record<ContentFormat, string> = {
  video_script: VIDEO_SCRIPT_INSTRUCTION,

  wechat_article: `【公众号文章】
要求：
- 篇幅只服从用户明确要求：用户给了字数/篇幅时严格执行；没提字数时按选题与信息量自然展开，不设默认字数下限或"最少字数"门槛
- 有吸引人的标题（放在第一行，格式：标题：xxx）
- 开头必须用下方「爆款开头库」中的一种思路做引子
- 正文必须参考下方「爆款文案结构库」组织，但输出时不要写结构标签
- 结尾必须用下方「结尾类型库」中的一种方式完成总结或互动
- 语言专业但易懂
- 适合微信公众号阅读习惯
- 文中出现政策红利、行业趋势、数据性断言时，若缺乏可追溯依据，用定性表达或标注「未提供/待补充」，不要编造引用来源。`,

  moments_post: `【朋友圈文案】
要求：
- 篇幅只服从用户明确要求；没提字数时保持朋友圈式短表达，不设固定字数区间门槛
- 简洁有力，适合朋友圈阅读
- 第一行必须有钩子，优先使用痛点、反差、利益输送或好奇开场
- 可以用emoji但不要过多
- 互动引导（提问/评论/私信）只在用户明确要求互动或引流时写；没要求时自然收束即可
- 不要用#话题标签
必含要素：第一行钩子、一句洞察；互动引导按用户要求，不默认添加。
禁用开场：感恩遇见、持续输出价值、有需要的朋友欢迎咨询。
平台语气：像老板随手发的真实状态，不要海报文案腔。`,

  community_message: `【社群运营文案】
要求：
- 篇幅只服从用户明确要求；没提字数时保持群消息式短表达，不设固定字数区间门槛，适合微信群/企微群发布
- 第一行先说明和群成员有关的痛点、机会或提醒，不能像广告
- 语气自然，像群主或运营负责人在群里提醒大家
- 轻量互动动作（回复关键词、评论问题、私信领取、报名咨询）只在用户明确要求时给出，不默认添加
- 不要承诺结果，不要制造暴富焦虑，不要使用夸张符号刷屏
必含要素：与群相关的具体提醒；互动动作按用户要求，不默认添加。
禁用开场：家人们、冲冲冲、错过再等一年。
平台语气：群主提醒，不硬广。`,

  raw_copy: `【原始文案】
要求：
- 篇幅只服从用户明确要求；没提字数时围绕核心信息自然展开，不设固定字数区间门槛
- 不套用任何爆款开头、文案结构或结尾模板
- 不做去AI味处理，保持自然流畅
- 围绕用户输入的核心信息展开，保留信息密度
- 可以适当分段，但不要加小标题
- 适合作为后续精修、改编的基础初稿
必含要素：围绕用户核心信息完整展开，不丢关键事实。
禁用开场：无强制模板；仍禁止空泛口号堆叠。
平台语气：服从用户指定风格；未指定时保持自然书面/口语混合。`,

  shooting_brief: `【拍摄交接单】
要求：
- 输出给拍摄、剪辑、运营执行，必须具体、清楚、可落地
- 必须包含以下字段，字段名不能省略：
视频标题：
核心观点：
目标客户：
视频目标：涨粉 / 建信任 / 引流 / 成交 / 客户教育 / 招商加盟（选择最适合的一项）
拍摄形式：口播 / 访谈 / 场景展示 / 混剪（选择最适合的一项）
建议时长：
脚本正文：
必拍镜头：
补充素材：
封面文案：
评论区引导：
私域承接话术：
事实风险提醒：
- 必拍镜头按脚本内容需要给出（每条可直接执行）；评论区引导和私域承接话术必须能直接复制使用；用户指定了镜头数量时严格按用户数量
- 脚本正文口语化、可直接照读，删掉废话和书面语
- 补充素材按视觉节奏标注可执行的画面变化，例如 B-Roll、特写、音效、字幕特效或画面切换
- 不承诺效果，不写保证涨粉、保证成交、月入多少等高风险表达`,

  // 仅用于读取旧请求和历史结果；新生成会统一归一到 video_script。
  koubo_script: VIDEO_SCRIPT_INSTRUCTION,

  xiaohongshu_post: buildXhsVisualDirectorInstruction(),
}
