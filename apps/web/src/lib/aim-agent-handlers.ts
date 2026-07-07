import { prisma } from "@/lib/prisma"
import { getAgentLLM } from "@/lib/llm/agent-router"
import type { ChatMessage } from "@/lib/llm/types"
import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"
import { buildBusinessDiagnosisMethodologyBlock } from "@/lib/business-diagnosis-methodology"
import {
  buildEventStorytellingMethodologyBlock,
  shouldUseEventStorytelling,
} from "@/lib/event-storytelling-methodology"
import { buildAimKnowledgeContext, fireKnowledgeEmbedding } from "@/lib/aim-knowledge-context"
import {
  resolveAimRuntimeTask,
  resolveKnowledgeStrategy,
  shouldUseKnowledgeContextForTask,
  type ResolvedKnowledgeStrategy,
  type AimRuntimeTask,
} from "@/lib/aim-knowledge-strategy"
import { compressAimMessages } from "@/lib/aim-context-compressor"
import { buildIpWikiBlock } from "@/lib/ip-wiki/context"
import {
  ContentFormat,
  AimTaskType,
  buildViralStructureBlock,
  parseMultiFormatResponse,
} from "./aim-generator"
import {
  addAimTraceStep,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { buildScenarioPromptBlock, type ContentScenario } from "@/lib/content-scenario-config"
import { buildExplicitWordCountPriorityRule } from "@/lib/aim-benchmark-length"
import { hasExplicitDirectDraftIntent } from "@/lib/aim-current-user-input"
import {
  buildConversationIntentBlock,
  resolveAimConversationIntentWithRules,
  type AimConversationMode,
  type AimConversationIntent,
} from "@/lib/aim-conversation-intent"

// ─── 类型定义 ──────────────────────────────────────────────

export type AimAgentId =
  | "content_producer"
  | "free_copywriter"
  | "deep_copywriter"
  | "business_system_diagnosis"
  | "business_diagnosis"
  | "content_review"
  | "persona"

export interface AimChatParams {
  userId: string
  projectId?: string
  messages: any[]
  knowledgeBlock: string
  conversationBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  conversationIntent?: AimConversationIntent
  trace?: AimTraceRecorder
}

export interface AimChatResponse {
  content: string
}

export interface AimGenerateContext {
  userId: string
  agentId: string
  projectId?: string
  rawInput: string
  targetFormats: ContentFormat[]
  taskType?: AimTaskType
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  videoCopyExtractionId?: string
  existingGenerationId?: string
  runtimeTask?: AimRuntimeTask

  // 共享数据上下文
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  /** 事件内容化方法论（现场/事件复盘类专用，非该类内容时为空串） */
  eventStorytellingBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  retrievedEntries: any[]
  retrievedSource: string
  /** 本次实际生效的知识调用策略（解析后回传，供 UI 反馈） */
  knowledgeStrategy: ResolvedKnowledgeStrategy
  /** 内容场景模式（由前端或路由层传入，驱动提示块和知识策略差异化） */
  contentScenario?: ContentScenario
  trace?: AimTraceRecorder
}

export interface AimGenerateResponse {
  id: string
  results: Array<{
    format: ContentFormat
    content: string
    wordCount: number
  }>
  knowledgeUsed: Array<{
    id: string
    title: string
    category: string
  }>
  conversationMode?: AimConversationMode
  /** 本次实际生效的知识调用策略（由 buildAimGeneration 解析后注入，供 UI 反馈） */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
}

export interface AimAgentHandler {
  agentId: AimAgentId
  chat(params: AimChatParams): Promise<AimChatResponse>
  streamChat(params: AimChatParams): AsyncIterable<string>
  generate(context: AimGenerateContext): Promise<AimGenerateResponse>
}

function buildChatContextBlock(params: {
  knowledgeBlock: string
  conversationBlock?: string
}) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

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

export function buildContentProducerChatPrompt(params: Pick<AimChatParams, "conversationBlock" | "knowledgeBlock" | "methodologyBlock" | "ipWikiBlock">): string {
  const contextBlock = buildChatContextBlock(params)
  return `你是一个身经百战的「太极营销创意总监」，正与企业老板（用户）面对面进行爆款营销文案创意碰撞与思路对齐。

你的使命：
根据用户已经给出的素材、热点选题、对标文案、企业知识库和方法论，直接给出可执行的文案方向、初稿或改写建议。

当前对话上下文：
${contextBlock}

IP操盘方法论（写作与判断规则）：
${params.methodologyBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 文案类智能体不追问客户，不让客户补充资料，不输出追问式开场。
2. 如果信息不足，基于已有上下文做合理假设，直接给出一个可用版本。
3. 可以说明"我会先按某个方向处理"，但后面必须跟成稿、结构方案或可复制文案。
4. 绝对不要说 AI 味的官腔、客套话（如"很高兴能与您碰撞"、"这是一个非常好的切入点"等）。
5. 先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
6. 如果用户确实需要先做定位或诊断，只给一句简短建议引导去定位策划官或商业诊断官，不在内容生产官里追问。
7. 如果输入是热点选题，只能说"热点/选题/事件/来源"，不要说"对标文案/对标原文/原视频"。
8. 方法论、知识库和历史稿件都只用于辅助理解与创作，不要盖过用户当前这一轮的明确要求。
9. 如果涉及对标文案改写，必须遵守：
${BENCHMARK_REWRITE_GUARDRAIL}
10. 如果用户要求把成稿整理成发布文案/发布话题/发布包，必须遵守：
${PUBLISH_PACKAGE_CHAT_RULE}
11. ${CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE}
12. 会话优先级固定为：当前轮用户修改要求 > 用户刚确认或刚点名的那版成稿 > 最近相关上下文 > 更早背景素材与知识库。用户说"这篇""这版""上面那个"时，默认指当前对话里最近相关的成稿或候选，不要回跳到更早那版。
13. 如果用户在纠偏、表达不满，或明确说"不要换""别重写""我不是这个意思"，先按他的纠正修改，不要继续执行上一轮默认流程。
14. 如果用户说"改开头""改第一句""改前3秒""结合这篇稿子去改上面文案"，就按局部修改处理：只改用户点名的部分，默认保留当前稿子的主题、正文主体和有效表达，不要擅自整篇重写。
14.1 不要擅自整篇重写或切回最早素材。
15. 如果用户要求"结合他的资料/人设/IP故事/来时路自然融入"，要把资料化进正文推进、案例、判断和身份表达里，不要单独拼一段履历总结，也不要生硬堆标签。
16. 如果用户表达了"别越改越短""保持原稿长度/体量""不要压缩"这类意图，就默认保留当前稿子的主体信息密度和篇幅；除非用户明确要求精简，否则不要主动缩成短版。

请直接根据上文与用户的历史对话，产出下一轮内容。`
}

// ─── 格式指令常量 ──────────────────────────────────────────

/**
 * 小红书图文视觉导演指令（xiaohongshu_post 专用）
 * 吸收 xhs-visual-director-skill 的产品结构（风格判断 / 统一视觉母版 / 8页结构 / 逐页提示词 / 自检），
 * 用 AIM 自家风格映射重写，不照搬外部 prompt。第一版只输出图文方案，不接真实图片生成。
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

## 8 页图文结构（每页只承担一个传播任务，禁止 PPT 式堆字）
1. 封面：强钩子 + 强视觉（吸引点击）
2. 痛点页：指出反常识或正在付出的代价
3. 认知页：为什么这件事重要
4. 方法页：给一个清晰框架
5. 案例页：用具体例子证明
6. 操作页：可立刻执行的步骤
7. 总结页：收束核心观点
8. 引导页：收藏 / 评论 / 关注

## 逐页必须输出
- 页面标题、副标题、核心文案、本页传播任务
- 本页使用风格 + 为什么这一页适合
- 视觉构图、主视觉元素、辅助元素
- 色彩、字体层级
- 图像生成提示词：画幅锁定 + 沿用母版哪些元素 + 本页只变化什么
- 负面提示词：必须含 no square image, no landscape, no inconsistent margins, no different template, no random layout shift

## 发布文案
- 小红书标题 5-10 个（标注主推版本）
- 正文（可用 emoji 但不堆砌，短句分段）
- 标签 2-5 个（贴合小红书搜索习惯）
- 评论区引导 + 可置顶评论

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
- 只写"高级、科技、极简"而不给具体视觉做法`
}

const FORMAT_INSTRUCTIONS: Record<ContentFormat, string> = {
  video_script: `【视频口播脚本】
要求：
- 200-500字，适合口播录制
- 开头3秒必须使用下方「爆款开头库」中的一种公式思路，不能平铺直叙
- 正文必须使用下方「爆款文案结构库」中的一种结构节拍
- 结尾必须使用下方「结尾类型库」中的一种方式
- 只输出纯口播文案正文，不要写画面、镜头、动作、字幕、音效或分镜说明
- 禁止出现【画面】【旁白】【镜头】【字幕】等任何分镜标签
- 节奏打磨：每10-12秒约40个字必须出现一个小转折、新观点或情绪点；如果段落太平，就用反问、比喻或一句结论拉住注意力
- 文盲式修改：删掉不影响意思的废话和虚词，用简单词替换书面语；每句话必须读起来顺口，像真人在说话；初中生听不懂就重写
- 用口语化表达，禁止书面语
- 禁止使用以下词汇：赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道`,

  wechat_article: `【公众号文章】
要求：
- 至少2000字纯文本，不够2000字视为不合格
- 有吸引人的标题（放在第一行，格式：标题：xxx）
- 开头必须用下方「爆款开头库」中的一种思路做引子
- 正文必须参考下方「爆款文案结构库」组织，但输出时不要写结构标签
- 结尾必须用下方「结尾类型库」中的一种方式完成总结或互动
- 语言专业但易懂
- 适合微信公众号阅读习惯
- 【GEO引用锚点规则】当文章中出现政策红利支持、行业趋势断言、数据性结论或统计数字时，在该句末尾以括号追加引用建议，优先建议引用政府官方政策或权威报告，格式为：（信息参考：建议引用[政策文件名称/权威机构报告]）。例如："随着数字化转型在企业中的深水区推进（信息参考：建议引用国务院《数字中国建设整体布局规划》或工信部企业数字化转型指导意见），这一能力已成为企业核心资产。"。引用建议每篇文章出现1-2处即可，优先以国家部委/政府部门发布的政策、规划、统计数据为最高权重信源，其次选择行业头部研究机构（如QuestMobile、艾瑞咨询）的白皮书，只在有真实公信力或宏观依据的断言处添加。`,

  moments_post: `【朋友圈文案】
要求：
- 50-200字
- 简洁有力，适合朋友圈阅读
- 第一行必须有钩子，优先使用痛点、反差、利益输送或好奇开场
- 内容结构必须有「冲突/洞察/行动」三段感，但不要写小标题
- 可以用emoji但不要过多
- 最后一句引导互动（提问/评论/私信）
- 不要用#话题标签`,

  community_message: `【社群运营文案】
要求：
- 80-220字，适合微信群/企微群发布
- 第一行先说明和群成员有关的痛点、机会或提醒，不能像广告
- 正文用「共情/洞察/行动」结构，但不要写小标题
- 语气自然，像群主或运营负责人在群里提醒大家
- 必须有一个轻量互动动作，例如回复关键词、评论问题、私信领取、报名咨询
- 不要承诺结果，不要制造暴富焦虑，不要使用夸张符号刷屏`,

  raw_copy: `【原始文案】
要求：
- 300-800字纯文本
- 不套用任何爆款开头、文案结构或结尾模板
- 不做去AI味处理，保持自然流畅
- 围绕用户输入的核心信息展开，保留信息密度
- 可以适当分段，但不要加小标题
- 适合作为后续精修、改编的基础初稿`,

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
- 必拍镜头至少给 3 条，评论区引导和私域承接话术必须能直接复制使用
- 脚本正文要按节奏打磨：每10-12秒约40个字有一个小转折、新观点或情绪点
- 脚本正文要做文盲式修改：删掉不影响意思的废话和虚词，用简单词替换书面语；每句话必须读起来顺口，像真人在说话；初中生听不懂就重写
- 补充素材要按视觉节奏标注：每2-4秒安排一个视觉变化点，例如 B-Roll、特写、音效、字幕特效或画面切换
- 不承诺效果，不写保证涨粉、保证成交、月入多少等高风险表达`,

  koubo_script: `【口播文案】
要求：
- 200-500字纯口播文字，适合直接对着镜头念
- 禁止分镜格式，不要写【画面】【旁白】等任何前缀或镜头标注
- 开头3秒必须使用下方「爆款开头库」中的一种公式思路，制造停留
- 正文必须使用下方「爆款文案结构库」中的一种结构节拍推进
- 结尾必须使用下方「结尾类型库」中的一种方式收束
- 用口语化表达，短句为主，保留必要停顿和语气词，禁止书面语
- 节奏打磨：每10-12秒约40个字必须出现一个小转折、新观点或情绪点；如果段落太平，就用反问、比喻或一句结论拉住注意力
- 文盲式修改：删掉不影响意思的废话和虚词，用简单词替换书面语；每句话必须读起来顺口，像真人在说话；初中生听不懂就重写
- 一段话就是一个完整口播段落，可以直接录制
- 禁止使用以下词汇：赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道`,

  xiaohongshu_post: buildXhsVisualDirectorInstruction(),
}

// ─── 1. 内容生产官 (ContentProducerHandler) ──────────────────

class ContentProducerHandler implements AimAgentHandler {
  agentId = "content_producer" as const

  private buildChatPrompt(params: AimChatParams): string {
    return buildContentProducerChatPrompt(params)
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = `你是一个企业营销内容专家。根据用户提供的信息，结合企业知识库，生成高质量的营销内容。`

    const formatBlocks = context.targetFormats
      .map((format) => FORMAT_INSTRUCTIONS[format])
      .join("\n\n---\n\n")

    const scenarioBlock = buildScenarioPromptBlock(context.contentScenario)
    const systemPrompt = buildProducerSystemPrompt(agentPrompt, context) + scenarioBlock
    const userPrompt = buildUserPrompt(context, formatBlocks)

    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      context.targetFormats,
    )

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: context.targetFormats.map((format) => ({
        format,
        content: parsed[format] || "",
        wordCount: (parsed[format] || "").length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 1b. 自由文案创作 (FreeCopywriterHandler) ─────────────────

class FreeCopywriterHandler implements AimAgentHandler {
  agentId = "free_copywriter" as const

  private buildPrompt(params: { knowledgeBlock: string; conversationBlock?: string; ipWikiBlock: string }): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个交货型文案写手，只负责听懂用户当前要求，并把文案直接交出来。

可参考的业务背景：
${contextBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}

规则：
1. 用户怎么要求就怎么写；用户的指令优先级高于模板、方法论、默认字数和系统习惯。
2. 用户要长就写长，用户要短就写短；没有明确字数时按内容自然长度写。
3. 不强制套爆款结构、开头库、结尾库、框架确认、观点池、95%-105% 字数规则或多平台拆分。
4. 不反问、不讲方法论、不输出分析报告；除非用户明确要求，只给一版可直接用的文案。
5. 保留人的语气，少用宣传腔、排比句和空泛总结。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildPrompt(params), params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const format = "raw_copy" as ContentFormat
    const systemPrompt = this.buildPrompt(context)
    const userPrompt = `请直接按用户要求写一版文案：
"${context.rawInput}"`
    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt)
    const content = completion.content.trim()
    const record = await saveAimGenerationRecord(context, completion, { [format]: content } as Record<ContentFormat, string | undefined>)

    return {
      id: record.id,
      results: [{ format, content, wordCount: content.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 2. 深度文案官 (DeepCopywriterHandler) ─────────────────────

class DeepCopywriterHandler implements AimAgentHandler {
  agentId = "deep_copywriter" as const

  /** 深度文案官在 generate 模式下只允许产出纯长文 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个深度文案官，负责把想法、视频原文、老板口述或对标文案，打磨成一篇高质量的完整长篇文案。

企业已有核心知识库（参考背景）：
${contextBlock}

IP操盘方法论（写作与判断规则）：
${params.methodologyBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 先判断用户当前要的是完整成稿、文案框架、局部修改，还是对上一轮结果的追改；按用户当前要求直接交付，不要默认切到固定流程。
2. 如果用户提供了爆款文案拆解、对标原文或"结构化拆解"，先抽取可迁移的开头机制、结构节奏、转折方式和心理推进，不要照搬原文句子。
3. 如果用户明确要完整成稿，且当前信息已经足够，直接输出完整长文，不要强制先问、先做框架或先做观点确认。
4. 只有在信息缺口会直接导致跑题或误判时，才先给文案框架或追问 1 个最关键问题；不要一次抛很多问题。
5. 需要给选择题时，每次只给 1 个问题，附 2-4 个具体选项，选项必须紧跟问题并按以下格式独立成行，方便前端渲染成逐题点击流程：
A. 选项内容
B. 选项内容
C. 选项内容
6. 不要只抛开放式问题；如果需要用户补充，把"也可以补一句真实想法"放在选项之后。
7. 热点只能基于用户提供的热点、已有上下文或明确行业趋势自然融合，禁止硬蹭或编造。
8. 成稿前先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
9. 输出最终正文时，正文最后一句写完就停止，不要追加任何拆分方向、私域话术、平台改写版本、总结点评或"你看是否符合"这类确认尾句。
10. 不暴露外部参考来源细节。
11. 方法论和知识库用于辅助判断与打磨，不要拿固定流程压过用户当前这轮的明确要求。
12. 如果涉及对标文案改写，必须遵守：
${BENCHMARK_REWRITE_GUARDRAIL}
13. 如果用户要求把成稿整理成发布文案/发布话题/发布包，必须遵守：
${PUBLISH_PACKAGE_CHAT_RULE}
14. 如果用户要求"结合他的资料/人设/IP故事/来时路自然融入"，要把资料自然化进正文推进、案例、判断和身份表达里，不要单独拼一段资料摘要或履历。
15. 如果用户表达了"别越改越短""保持原稿长度/体量""不要压缩"这类意图，就默认保留当前稿子的主体信息密度和篇幅；除非用户明确要求精简，否则不要主动缩成短版。

请直接根据上文与用户的历史对话，产出下一轮内容。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：强制只允许全文类格式 ──
    const allowed = context.targetFormats.filter((f) =>
      DeepCopywriterHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    // 如果所有请求格式都不在允许范围内，默认产出 raw_copy
    const safeTargets = allowed.length > 0 ? allowed : ["raw_copy" as ContentFormat]
    const directDraftRequested = hasExplicitDirectDraftIntent(context.rawInput)

    const agentPrompt = `你是一个深度文案官，专门把想法、视频原文、老板口述或对标文案先搭出文案框架，再打磨成高质量长篇文案正文。

【核心输出规则 — 严格遵循】
- ${
      directDraftRequested
        ? "当前这轮用户已经明确要求直接交稿。只要现有素材足够，直接输出完整深度长文正文，不要继续停在框架、观点确认或追问。"
        : "如果上下文里还没有明确文案框架，先输出文案框架，不要直接写正文。"
    }
- 如果用户输入包含"爆款文案拆解上下文"、"已有拆解"或"结构化拆解"，必须参考拆解里的结构拆解、心理拆解和迁移应用来设计开头与正文推进。
- 文案框架必须包含：核心观点、目标读者、情绪入口、开篇进入方式、正文推进结构、可迁移的爆款结构。
- 核心观点必须来自原视频/原选题；IP特色、知识库和产品信息只能融入案例、身份表达和承接动作，不能另起主题。
- 开篇进入方式要重新创作，吸收原文开头的有效机制，但不要照搬原句。
- ${BENCHMARK_REWRITE_GUARDRAIL}
- 如果上下文里用户已经确认文案框架，再输出一篇完整深度长文正文，禁止输出以下任何内容：
  ✗ 观点确认卡
  ✗ 热点判断
  ✗ 内容大纲
  ✗ 额外开头设计栏目
  ✗ 备选版本
  ✗ 后续拆分方向
  ✗ "可拆分方向"模块
  ✗ 私域话术
  ✗ 任何改写版本或二次分发版本
  ✗ "你看节奏和内容是否符合"这类确认尾句
  ✗ 任何平台分发内容
- 必须是一篇连续长文，不要拆成多个交付模块。
- 正文最后一句写完就停止，不要追加解释、建议、点评或问句。
- 热点只能基于用户提供的热点、已有上下文或明确行业趋势自然融合，禁止硬蹭或编造。
- 先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
- 不暴露外部参考来源细节。`

    const systemPrompt = `${agentPrompt}

${context.knowledgeBlock}
${context.methodologyBlock}
${context.eventStorytellingBlock}
${context.ipWikiBlock ? `${context.ipWikiBlock}\n` : ""}
内部工作流程：
1. 围绕选题主张或输入素材，展开成文。
2. 如果有对标文案，先锁定原视频核心选题，再把表达迁移成本IP的案例、身份和承接。
3. 保持真实口语感、情绪共鸣与深刻洞察，杜绝公文宣传腔和万金油排比句。
4. 未确认框架时先输出文案框架；已确认框架后，只输出一篇完整深度长文正文，不加任何附加结构标记，正文结束立刻停止。

对标改写硬规则：
${BENCHMARK_REWRITE_GUARDRAIL}

请严格按照格式输出。不要添加任何附加的大纲、平台栏目、私域话术、拆分方向、解释、点评或确认尾句。`

    const workflowContext = buildWorkflowContext(context)
    const explicitWordCountRule = buildExplicitWordCountPriorityRule(context.rawInput)
    const userPrompt = `用户输入的原始内容：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

${explicitWordCountRule ? `字数冲突处理：${explicitWordCountRule}\n\n` : ""}请根据上下文判断：如果还没有明确文案框架，先输出文案框架；如果已经确认框架，直接输出正文。正文最后一句写完就停止，不要包含解释性文字、拆分方向、私域话术或确认尾句。`

    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      safeTargets,
    )

    const rawText = parsed.raw_copy || completion.content.trim()

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: safeTargets.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 3. 商业诊断官 (BusinessSystemDiagnosisHandler) ───────────

class BusinessSystemDiagnosisHandler implements AimAgentHandler {
  agentId = "business_system_diagnosis" as const

  /** 商业诊断官仅产出诊断报告 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个企业商业诊断官，正在帮助用户做一次生意系统体检。

企业已有核心知识库（参考背景）：
${contextBlock}

商业诊断方法论（内部判断规则，仅供你自己判断用，绝不向用户提及任何框架名、英文缩写或流程名）：
${params.businessDiagnosisBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话路由（必须先判断用户的问题是否成立，再决定怎么回答）：
1. 先判断问题是否成立：按方法论里的「问诊消解漏斗」从上往下判断，命中即在该层处理，不要跳到体检。
   - 信息类问题（行业标准/平台规则/合规边界）：能答的直接简短答完；拿不准的提示查官方资料，不要编数字。
   - 情绪类问题（抱怨/发泄/求认同）：共情一句，把对话拉回可诊断的事实层，不要套诊断框架。
   - 语言陷阱（高端/适合/值得/定位不清/流量差/转化差等模糊词）：先要求用户说清到底指什么，不直接给方案。
   - 假设错误（有流量就能成交、产品好就该卖、发得多就会爆、对标能成我也能）：先点破站不住脚的前提。
   - 逻辑错误（相关性当因果、个别对标当可复制、单点数据下全局结论）：先纠正推理方式。
   - 事实前提不清（缺关键数据/自相矛盾）：先要求给出关键数据。
2. 当问题成立但信息还不足时：每次只追问一个最关键问题，并给出 2-4 个可选答案让用户选择，不要做开放式填空。
3. 重点围绕业务类型、现状数据、真实目标、约束条件、验收标准追问。
4. 只有当问题成立、关键事实已校准、且用户有产品/案例/资源/时间或执行意愿时，才提醒用户可以点击【一键生成】生成完整诊断报告。在此之前不要生成报告。
5. 不要让用户做开放式填空题；如果必须开放补充，把它放在选项之后，作为"也可以补充具体情况"。
6. 统一呈现为生意系统体检，不解释内部方法来源。

请直接根据上文与用户的历史对话，产出你下一轮的建议或追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 诊断报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      BusinessSystemDiagnosisHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = `你是一个企业商业诊断官，负责根据与用户的沟通事实，结合企业知识库，生成专业的生意系统体检报告。

商业诊断方法论（体检评判准则，仅供你判断用，绝不向用户提及任何框架名、英文缩写或流程名）：
${context.businessDiagnosisBlock}

企业已有核心知识库（参考背景）：
${context.knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}

体检报告必须严格按以下八段固定结构输出，缺一不可，顺序不可调换：

## 业务现状说明
把口语化抱怨整理成可诊断的现状：主体边界、现状数据（营收/流量/咨询/成交/客单价/复购/成本）、真实目标、约束条件。

## 模糊概念澄清
点出本轮必须拆掉的模糊词（如高端/适合/定位不清等），给出真实定义和不能继续混用的词。

## 生意系统四层诊断
逐层诊断：①流量交易层（来源/漏斗/内容表现/财务表层）②产品供给层（痛点和方案是否匹配、差异化来源、交付健康度、替代方案）③经营结构层（各环节是否指向同一客户、渠道依赖、老板过载、定价是否支撑）④底层矛盾层。

## 核心矛盾判断
只给 1 个核心矛盾（不列一堆问题吓人），可附 2-3 个次要矛盾。

## 行业参照校验
用同体量、同模式、投产、风险、可复制 5 个维度校验，给出可参考规律和不可盲目模仿的部分。

## 多视角复核
从事实、直觉、风险、机会、创新、收束 6 个视角压测。

## 三条调整路径
保守改良 / 中度调整 / 模式重构，各给一条。

## 本周最小动作
只给一个本周就能做、且最重要的小动作。

输出硬约束：
- 只给 1 个核心矛盾，不堆砌问题清单。
- 每条建议必须绑定资源、人力、时间、风险，不说"多做内容""做好私域"这类空话。
- 不承诺结果。
- 【禁止输出】短视频脚本、朋友圈文案、社群文案、拍摄交接单、公众号文章、小红书图文等任何营销分发内容。
- 统一呈现为生意系统体检，不解释内部方法来源。
直接输出报告，不输出无关大纲、钩子或营销分发内容，不要任何 AI 官腔。`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的原始信息与对话记录：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份详细的"生意系统体检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 4. 定位策划官 (BusinessDiagnosisHandler) ────────────────

class BusinessDiagnosisHandler implements AimAgentHandler {
  agentId = "business_diagnosis" as const

  /** 定位策划官仅产出定位方案 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个定位策划官，负责帮助用户明确 IP 定位、人设定位、内容定位和初始成交路径。

企业已有核心知识库（参考背景）：
${contextBlock}

IP操盘方法论（内部判断规则，只能用于推理，不得原样展示给用户）：
${params.methodologyBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 只处理 IP 本身：这个人如何站出来、被谁信任、讲什么内容、承接什么产品。
2. 先判断用户当前在走哪条路由：
   - 选题策划路由：用户在反复确认账号方向、选题方向、内容栏目、爆款角度时，交互式输出 3-5 个可选选题方向，并追问最影响选择的一个问题。
   - 日更100条选题路由：用户提到日更、100条、选题库、内容日历、长期选题、每天发什么时，直接输出完整 100 条选题库，不要只给 3-5 条。
   - 会议纪要内容资产包路由：用户提供会议纪要/访谈逐字稿，并要求整理、生成选题、任务清单、拍摄清单、采访问题、脚本模板时，输出一份可执行的内容资产包，而不是只给 3-5 条选题。
   - 核心选题交接路由：用户明确说只要一个核心选题、直接进入下一步文案、不要完整整理时，只输出一个最值得拍的选题和给文案智能体的交接说明。
   - 工具包单项路由：用户只要求任务清单、采访清单、问卷表或脚本模板中的某一种时，只输出该单项工具，不顺手展开完整资产包。
   - 完整 IP 策划路由：用户要求定盘、策划方案、IP 全案（但未明确要求天命操盘全案）时，提醒可点击【一键生成】交付完整方案。
   - 人设卖点梳理路由：用户提供采访稿、成长经历、客户人设素材时，先提炼人设卖点、差异化特色、可信证据和可表达角度。
   - 天命IP资产化操盘全案路由：当用户明确提到「天命IP」「资产化」「操盘全案」「12 模块」，或对话上下文来自商业诊断官（生意系统体检）并要求进一步做 IP 全案时，走这条路由。该路由输出固定 12 个客户结果段（项目总判断、天命底盘、IP主定位、目标客户、核心问题、IP价值、产品设计、内容系统、流量闭环、私域成交、交付资产化、行动处方），每段都必须基于客户知识库/客户资料/本轮上下文推导；方法论只做后台判断，不得把方法论名称、公式、模块解释原样呈现给用户。没有八字/紫微资料时，天命底盘写「未提供/待补充」，不编造命理。
   - 知识库驱动选题路由：当用户明确要求「基于知识库」「根据知识库做选题」「基于人设故事」「知识库选题」「选题加文案结构」「基于采访素材做选题」，或本次对话上下文里已经选中了较完整的客户知识库（老板经历/人设素材）且要求做选题时，走这条路由。该路由必须基于客户知识库里的真实人物、真实事件、真实金句生成选题，严禁编造人物/数字/事件。
3. 日更100条选题路由必须先展示"选题方法论底盘"，且只能使用四类选题方法论：
   - 热点类：结合当前行业、平台和对标账号正在发生的热点，但必须回到本账号的产品、客户和观点，不硬蹭。
   - 人设类：让用户相信"这个人靠谱、懂我、值得听"；适合来时路、价值观、专业经历、踩坑、工作现场、vlog。
   - 问题解答类：站在客户角度，把痛点、顾虑、案例和业务价值讲清楚，再给解决方案；适合痛点拆解、避坑指南、客户问答、案例拆解、方法清单。
   - 观点类：输出自己的判断、立场、反常识和行业认知；适合趋势判断、旧认知纠偏、老板认知、争议话题。
4. 日更100条选题路由的 100 条表格字段固定为：编号、选题标题、选题类型、目标用户、切入角度、可拍内容、承接目的；选题类型只能从上述四类中选择。
5. 信息不足时，优先追问能影响当前路由结果的关键问题，每次只追问一个，并给出 2-4 个可选答案让用户选择；但用户明确要日更100条选题时，不要追问，基于现有资料直接生成。
6. 不要让用户做开放式填空题；选项必须具体，例如"专家型 / 老板实战型 / 陪伴型 / 行业观察型"。
7. 全站选题策划的基准线是整体 IP 操作方案/客户项目全案：任何选题先对齐目标客户、主产品/服务、成交路径、交付目标和账号定位。会议纪要、热点、对标、客户痛点、问卷和采访清单只是素材来源，用来补充钩子、证据、真实问题和执行动作，不得覆盖基准线。不同选题再匹配不同知识库资料：问题解答类优先客户痛点/客户问答/会议纪要，转化类优先产品卖点/项目案例/成交记录，人设类优先老板经历/定位素材，热点类优先行业信源/对标动态。
8. 只有用户明确要求「基于会议纪要/调用会议纪要」，或本次选题素材明确选中了会议纪要时，才把会议纪要作为主要依据，并从客户原话、真实问题、分歧、案例、顾虑和下一步动作中拆选题。
9. 会议纪要内容资产包路由必须高密度，不做流水账总结。固定输出：
   - 会议一句话结论：这场会真正要解决什么内容/获客/成交问题。
   - 关键信息抽取表：原话/事实、说话对象或角色、暴露的问题/顾虑/机会、可转成的内容角度、证据强度。至少 8 条；材料不足时写实际可提取条数，不编造。
   - 核心矛盾/机会：只给 1 个主矛盾和 2-3 个次矛盾，必须对应会议里的原话或事实。
   - 可拍选题池：至少 12 条；每条字段固定为选题标题、选题类型、目标受众、会议证据、开头钩子、拍摄场景/素材、承接目的。
   - 优先级最高的 3 条：说明为什么先拍，必须结合信任建立、转化价值、现场可拍性。
   - 执行清单：任务、负责人/角色、输入材料、交付物、验收标准。
   - 采访追问清单：采访对象、问题、追问、想拿到的原话/证据。
   - 脚本/分镜方向：只给方向和开头钩子，不直接写完整脚本，除非用户明确要脚本。
   - 可沉淀知识库素材：人物事实、项目事实、客户痛点、产品卖点、案例证据、待补充信息。
   会议纪要资产包禁止只写“三个方向、三个账号”这类空泛概括；禁止结尾反问“是否需要我展开脚本/继续生成”，直接给下一步最小动作。
10. 核心选题交接路由只输出：核心选题标题、为什么只选它、目标受众、开头钩子、内容主线、必用会议原话/事实、文案创作交接说明。不要输出选题库、长任务清单、完整分镜和多个备选。
11. 工具包单项路由要克制：任务清单只给执行表；采访清单只给采访对象和问题；问卷表只给问题和题型；脚本模板只给文案创作模板。不要混在一起输出。
12. 如果缺少关键依据，优先追问可调用的数据来源，例如会议纪要、对标账号、历史爆款、客户画像、成交记录、行业报告或企业知识库素材。
13. 如果企业知识库里出现【对标账号监控数据】，用户问近期作品、发了什么、账号特点时，直接基于这些作品列表回答，并说明这是最近一次刷新缓存，不要泛泛建议用户去看数据。
14. 知识库驱动选题路由（F 路由）的固定约束：
   - 先从客户知识库抽取真实素材：人物身份/经历/铁证标签/反差点/至暗时刻/高光时刻/原生家庭冲突/识人案例/金句原话，列在「素材锚点」段，每条素材必须标注来自知识库哪一处。
   - 产出约 8-12 条选题，每条固定字段：选题一句话标题、内容路由类型（人设信任型/观点立场型/问题解决型/案例转化型）、叙事引擎、开头钩子类型、价值观锚点、对应的知识库素材来源。
   - 叙事引擎铁律（核心纠错）：人设信任型选题用「故事弧线5拍」（困难→冲突→内心矛盾→解决→结果），严禁用 5A 漏斗；观点立场型/问题解决型/案例转化型可用 5A（Aware→Appeal→Ask→Act→Advocate）。理由：人设型靠故事建信任，5A 是转化漏斗，硬套会把故事讲成带货感。
   - 每条人设型选题必须显式点出「内心矛盾」那一拍（主人公内心怎么纠结/两难/挣扎），这是 5A 里没有、故事弧线独有的引擎。
   - 守人设红线：不立霸道总裁、不卖惨、不仇富、不神化投资；客户/合伙人姓名按知识库里的脱敏规则匿名化。
   - 知识库不足时，不要追问填空，直接按现有素材生成，并在缺口处标注「待补充」。

请直接根据上文与用户的历史对话，产出你下一轮的建议或追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 定位方案 ──
    const safeTargets = context.targetFormats.filter((f) =>
      BusinessDiagnosisHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = `你是一个定位策划官，负责为企业老板明确 IP 营销的全局定位与成交路径方案。

企业已有核心知识库（参考背景）：
${context.knowledgeBlock}

IP操盘方法论（内部判断规则，只能用于推理，不得原样展示给用户）：
${context.methodologyBlock}

${AIM_HIGH_RISK_LOOP_RULE}

策划方案输出结构要求：
先判断用户输入最适合哪条交付路由，并按该路由输出，不要把四种结果混在一起：

A. 选题策划路由（反复确认选题）
1. 当前选题判断：用户真正想抢占的目标人群、需求场景和内容机会。
2. 选题候选：给 3-5 个可执行选题方向，每个包含选题名、目标人群、切入角度、可拍内容、为什么值得做。
3. 筛选建议：标出优先级最高的 1-2 个，并说明依据。
4. 下一轮确认问题：只问一个最关键问题，帮助继续收窄选题。

B. 日更100条选题路由
触发词：日更、100条、选题库、内容日历、长期选题、每天发什么。
触发后不要只给 3-5 条，直接输出 100 条选题库。输出前必须先展示"选题方法论底盘"，且只包含以下四类：
1. 热点类：结合当前行业、平台和对标账号正在发生的热点，但必须回到本账号的产品、客户和观点，不硬蹭。写法是先抓热点变化，再讲它和目标客户有什么关系，最后落到自己的判断或方案。
2. 人设类：让用户相信"这个人靠谱、懂我、值得听"。适合来时路、价值观、专业经历、踩坑、工作现场、vlog。写法是先给一个真实场景或经历，再说这个经历形成了什么判断，最后落到用户为什么可以信任你。
3. 问题解答类：站在客户角度，把他们关心的问题、痛点、顾虑、案例和业务价值讲清楚，再给自己的解决方案。适合痛点拆解、避坑指南、产品如何解决问题、客户常见问题答疑、案例拆解、方法清单。
4. 观点类：输出自己的判断、立场、反常识和行业认知。适合趋势判断、旧认知纠偏、老板认知、争议话题。写法是先给明确判断，再拆普通人为什么会判断错，最后给自己的判断标准。

100 条选题表字段固定为：编号、选题标题、选题类型、目标用户、切入角度、可拍内容、承接目的。选题类型只能是：热点类、人设类、问题解答类、观点类。

C. 完整 IP 策划路由
1. 关键数据来源与依据：先列出本次实际使用的依据，至少区分用户输入、企业知识库/定位素材、已分析对标账号/爆款样本、行业/平台数据；没有调用到的数据必须标明"未提供/待补充"，不得编造来源。
2. 账号分析参考来源：必须把【市场洞察爆款作品上下文】或【对标账号监控数据】作为账号分析参考来源；至少归纳对标账号的内容母题、爆款钩子、受众假设、表达风格、可迁移点和不可迁移点。没有这类数据时写"已分析对标账号：未提供/待补充"。
3. 数据分析、数据来源、数据精选：只保留能影响定位判断的数据，说明每条数据支持了哪个结论；对标账号智慧可以做综合归纳，但必须标为"对标综合判断"，不能伪装成精确统计。
4. IP定位主张：一句话的差异化定位口号（Slogan）及核心目标受众画像。
5. 人设特点的真正挖掘：从经历、能力证据、表达气质、价值观、反差点、信任来源里提炼人设，不只堆"专家/老师/陪伴者"标签。
6. 核心点位设计：必须包含定位点位、人设点位、内容点位、信任点位、成交点位、差异化点位；每个点位说明"为什么成立"和"后续内容怎么体现"。
7. 核心内容体系规划：梳理 3 大核心内容方向/选题专栏，并设计爆款选题示范。
8. 初始成交路径设计：用户从刷到短视频、进粉丝群，到最终加私域成交的完整路线指引。
9. 内容策略底盘：话题分布建议（含建议比例）、内容形式占比、钩子模式、发布频率与最佳时段、爆款公式。

D. 人设卖点梳理路由（采访/人设素材）
1. 人设素材摘要：只提炼事实，不美化、不补编。
2. 人设卖点：提炼 3-5 个可被用户记住的卖点，每个必须对应原始素材里的证据。
3. 差异化特色：指出这个人和同类 IP 不一样的经历、气质、能力或价值观。
4. 表达资产：输出可用于主页简介、置顶视频、选题栏目和转化页的表达角度。
5. 缺口问题：列出还缺的 1-3 类证据，方便继续采访。

E. 天命IP资产化操盘全案路由
触发条件（满足任一即走本路由，不走 A-D）：
- 用户明确提到「天命IP」「资产化」「操盘全案」「12 模块」「商业验证后」；
- 上下文来自商业诊断官（生意系统体检），并要求进一步做 IP 全案或操盘框架。
输出固定 12 个客户结果段（顺序固定，缺一不可）：
1. 项目总判断：一句话判断核心问题——"这个 IP 当前不是【表面问题】，而是【底层问题】"，附当前阶段判断、最大卡点、优先解决方向。
2. 天命底盘：从主理人的八字/紫微判断适合的身份路线、站前台还是幕后、强项方向、不适合硬装的方向；只用于商业表达和人设校准，不做玄学展示。没有命理资料时写"未提供/待补充"，基于已知经历、能力、表达气质做推断判断，绝不编造命理结论。
3. IP 主定位：直接给出适合该客户的主身份、目标人群、核心问题、一句话定位、不建议使用的标签，并说明分别来自客户知识库里的哪些事实或本轮输入；不要展示"定位公式"或占位模板。
4. 目标客户：只抓最值得成交和最适合交付的人；输出核心客户、不适合客户、客户筛选标准。
5. 核心问题：区分客户表面需求（流量/涨粉/课程/工具/话术）和真实问题（身份不清、经验没产品化、内容没信任感、私域没承接、成交没诊断逻辑、交付没沉淀）。
6. IP 价值：结合客户已提供的经历、能力、案例、用户需求、信任资产、产品承接和交付复用潜力，输出价值判断、变现潜力、当前最值得放大的优势、当前最需要补齐的短板；不要展示方法论公式。
7. 产品设计：从"客户愿意为什么结果付费"出发；输出产品阶梯（引流品→低客单→中客单→高客单）、主推产品、高客单成果包、产品边界、升级路径；高客单卖成果不卖时间。
8. 内容系统：围绕定位和成交搭栏目（认知类/方法类/案例类/转化类）；输出内容主线、内容栏目、选题方向、置顶视频方向、转化型内容设计。
9. 流量闭环：内容触达→互动→领资料→加微信→填诊断→进社群/咨询→转化产品→沉淀案例；输出引流路径、私信关键词、微信承接动作、社群/私域培育方式、转化入口。
10. 私域成交：成交是诊断不是硬聊（确认现状→找卡点→解释→给路径→对应产品→明确下一步）；输出诊断问题、客户分层、成交逻辑、跟进节奏、常见异议处理。
11. 交付资产化：把经验沉淀成资产（定位表/用户画像/产品说明页/选题库/私域话术/成交问答/案例库/交付 SOP/知识库/智能体）；输出交付流程、SOP 清单、案例沉淀、知识库结构、智能体方向。
12. 行动处方：只给优先级——"当前第一优先级不是【错误动作】，而是【正确动作】。接下来只做三件事：1…2…3…"，一句话结论收尾。
本路由硬约束：
- 客户知识库/客户资料/本轮上下文是正文依据，方法论只做后台推理；禁止把方法论名称、定位公式、模块解释、占位符模板原样呈现给用户。
- 每个模块都要能指导后续选题、文案、产品承接、私域成交和交付资产化，不能只给静态描述。
- 全案必须区分「已验证事实 / 推断判断 / 待补充证据」三类，缺数据写待补充，不编造。
- 天命底盘无命理资料时必须写"未提供/待补充"，不输出玄学断言。

F. 知识库驱动选题路由（选题 + 文案结构）
触发条件（满足任一即走本路由，不走 A-E）：
- 用户明确提到「基于知识库」「根据知识库做选题」「基于人设故事」「知识库选题」「选题加文案结构」「基于采访素材做选题」；
- 本轮上下文已选中较完整的客户知识库（老板经历/人设素材）且要求做选题。
固定输出结构（顺序固定）：
1. 素材锚点：从客户知识库抽取的真实素材清单——人物身份、经历、铁证标签、反差点、至暗时刻、高光时刻、原生家庭冲突、识人案例、金句原话；每条必须标注来源（知识库哪一节）。严禁编造知识库里没有的人物、数字、事件、金句。
2. 账号阶段判断：基于知识库判断当前 IP 处于哪个阶段（第一阶段立人设 / 第二阶段做矩阵 / 第三阶段做转化闭环），并据此决定内容路由配比。
3. 选题清单（约 8-12 条）：每条固定字段——① 选题一句话标题 ② 内容路由类型（人设信任型/观点立场型/问题解决型/案例转化型）③ 叙事引擎 ④ 10套结构之一 ⑤ 16套表达模板之一 ⑥ 七大开头之一 ⑦ 价值观锚点 ⑧ 知识库素材来源。
4. 文案结构（每条选题配一段）：
   - 人设信任型 → 故事弧线5拍（困难→冲突→【内心矛盾】→解决→结果），用 20/20/25/20/15 占比，必须点出内心矛盾那一拍；
   - 观点立场型/问题解决型/案例转化型 → 5A 漏斗走位（标注走到哪几步），用事件内容化5段式骨架。
5. 统一约束自检：每条只讲一个核心问题、只留一个 CTA、回归四个价值观锚点之一、守人设红线、保留原话/毛边（去AI味）。
6. 待补充：列出知识库里缺、但能提升选题质量的素材方向（供下次采访补全）。
本路由硬约束：
- 正文依据是客户知识库/本轮上下文，方法论只做后台推理；禁止把方法论名称、公式、卡片编号原样呈现给用户，只在正文最前面的 [[AIM_METHOD_NOTE]] 块里用 3-5 条说明本次调用了哪些判断标准、证据来源和取舍。
- 叙事引擎铁律：人设型必须故事弧线、不得用 5A；非人设型才可用 5A。这是本路由区别于其他路由的核心规则。
- 严禁编造知识库里没有的人物、数字、事件、金句；素材不足写「待补充」，不写漂亮但无依据的结论。
- 【禁止输出】完整可拍口播成稿（那是内容文案创作的活）；本路由只交付选题 + 文案结构骨架。

内部判断要求：定位结果必须能反向指导后续选题和文案。不只输出静态人设描述——内容策略底盘要说明后续选题和文案应围绕哪些主题、形式、钩子和发布节奏展开。所有数字都要分清"已有证据"和"建议比例/推断"，缺数据时宁可写待补充，不写漂亮但无依据的结论。

方法论呈现规则：
- 方法论只用于思考过程，最终方案必须直接给结果，不要写成"我们的方法论说明书"。
- 如果需要说明判断依据，只在正文最前面输出一个短块：
[[AIM_METHOD_NOTE]]
用 3-5 条写清本次调用了哪些判断标准、证据来源和取舍。
[[/AIM_METHOD_NOTE]]
- 该短块之外的正文必须是客户可直接使用的方案结果。

【禁止输出】短视频脚本、朋友圈文案、社群文案、拍摄交接单、公众号文章等任何营销分发内容。
请直接交付一份落地方案，语气干练、坚定、去AI味，不用加任何多余的开头废话，直接输出正文。`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的原始信息与背景：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份详细的"IP营销策划定位方案"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

export function buildContentReviewChatPrompt(contextBlock: string): string {
  return `你是「发布质检官」，负责对准备发布的口播、短视频脚本、公众号正文、朋友圈文案做发布前自查。

企业已有核心知识库（只作背景，不要抢走用户当前稿子的主题）：
${contextBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 只做质检和最小修改建议，不要整篇重写，除非用户明确要求重写。
2. 优先检查：开头吸引力、逻辑顺畅、AI味/套话、文笔表达、平台风险、转化承接、流量潜力。
3. 输出必须包含：总体结论、必改问题、风险等级、流量潜力评分（0-100分）、最小修改建议、复检清单。
4. 如果发现疑似违规、绝对化、诱导私信、夸大承诺或平台敏感表达，明确标出原句和替换建议。
5. 如果用户没有提供完整文案，直接提醒用户粘贴稿子或选择最近生成稿，不要凭空质检。

请直接根据上文与用户的历史对话，输出发布前质检建议。`
}

export function buildContentReviewGeneratePrompt(knowledgeBlock: string): string {
  return `你是「发布质检官」，负责对准备发布的文案做发布前自查。

企业已有核心知识库（只作背景，不要抢走用户当前稿子的主题）：
${knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}

质检报告输出结构要求：
1. 总体结论：可发 / 改完可发 / 暂不建议发，并说明一句理由。
2. 必改问题：列出最影响发布的 1-5 个问题，指出原句或段落。
3. 平台风险：检查违规、限流、绝对化、夸大承诺、诱导私信、AI标注提醒等风险。
4. 表达质量：检查开头吸引力、逻辑、去AI味、文笔，不做空泛夸奖。
5. 流量潜力评分：给 0-100 分，只看停留钩子、评论争议、收藏价值、转粉/转化承接，不做播放量预测。
6. 最小修改建议：只给局部替换和删改建议，不要整篇重写。
7. 复检清单：用 3-5 条短句告诉用户改完后再看什么。

【禁止输出】新的营销文案、完整重写稿、播放量预测、发布后数据复盘。
如果用户没有提供完整文案，提示用户粘贴稿子或选择最近生成稿。
请直接输出质检报告，不写套话、黑话和前言。`
}

// ─── 5. 发布质检官 (ContentReviewHandler) ────────────────────

class ContentReviewHandler implements AimAgentHandler {
  agentId = "content_review" as const

  /** 发布质检官仅产出 raw_copy 质检报告 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    return buildContentReviewChatPrompt(buildChatContextBlock(params))
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 质检报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      ContentReviewHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = buildContentReviewGeneratePrompt(context.knowledgeBlock)

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的待质检文案或质检要求：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份"发布前质检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 6. 人设故事官 (PersonaHandler) ─────────────────────

class PersonaHandler implements AimAgentHandler {
  agentId = "persona" as const

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是「人设故事官」，专门帮 IP 把自己的"来时路"一步步梳理成一条高质量的置顶视频脚本。

企业已有核心知识库（参考背景）：
${contextBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的工作方式（引导式，每轮只推进一个维度）：
按顺序把以下 6 个维度收集齐，每轮只追问当前最关键的 1 个缺口，并给一个降低门槛的回答示例：
1. 经历与成就：哪一年做了什么、做成/赚到过什么（要具体年份，是置顶视频的关键记忆点）
2. 低谷与转折：哪一年跌入困境、最痛的点是什么
3. 顿悟：什么契机让你想明白、悟到了什么
4. 当前产品/服务：现在具体做什么、卖什么、怎么交付
5. 目标用户与卡点：服务谁、他们最具体的困境（一句话）
6. 标志性结果/案例：一个能证明你方法有效的具体案例或客户反馈

每轮回复的硬性格式（必须严格遵守）：
- 第一行必须是进度标记，精确格式：【进度 XX%】（XX 按已收齐维度估算：6 维全齐=100%，每维约 15-20%；用户信息越具体越接近满格；只要还差一个维度就别给 100%）
- 进度标记后，先用 2-4 行简述"目前已经清楚的部分"
- 再用 1 行点明"现在最影响脚本质量的地方"
- 然后只问当前最关键的 1 个缺口，附一个回答示例（例如"你可以从『某年某月，我…』开始"），一次只问一个，不要抛多个开放问题
- 当且仅当进度到达 100%（6 维基本齐）时，停止追问，直接产出：
  ①「来时路总结」一段（150 字内）
  ②「置顶视频脚本」：逐句"口播 + 配图建议"，每句单独成行，10-18 句
- 产出脚本后，如果用户说"第 N 句改 X / 去掉 Y"，只调整对应句，然后重新给出整段脚本，其他句保持不变

风格要求：
- 口语、真诚、像本人说话；避免 AI 腔、宣传腔、整齐排比和万能结尾
- 不主动提过时热点或已过气的网络梗
- 不暴露内部参考来源

请根据上文与用户的历史对话，产出下一轮内容（必须以【进度 XX%】开头）。`
  }

  private buildIntakeReceivePrompt(): string {
    return `你是一个「前采信息整理专家」。用户会分批发送前采资料。
规则：
1. 用户发来前采文字时，只需回复"收到"。
2. 不要追问、不要分析、不要输出任何报告。
3. 等待用户发送"开始整理"的指令。
请回复"收到"。`
  }

  private buildIntakeCompilePrompt(): string {
    return `你是一个「前采信息整理专家」。请根据对话历史中的所有前采内容，输出结构化报告：

## 一、身份信息
## 二、人设特征
## 三、故事素材（3-5 个有爆点的真实故事）
## 四、商业逻辑
## 五、客户画像
## 六、内容素材（5-10 个可做选题的话题 + 金句）
## 七、信息缺口与补采建议（5-10 个具体问题）

直接输出报告，不要追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    const lastUserMsg = params.messages[params.messages.length - 1]?.content ?? ""
    const mode = detectPersonaMode(lastUserMsg)
    let prompt: string
    if (mode === "intake") {
      prompt = this.buildIntakeReceivePrompt()
    } else if (mode === "intake_compile") {
      prompt = this.buildIntakeCompilePrompt()
    } else {
      prompt = this.buildChatPrompt(params)
    }
    return executeChatLLM(this.agentId, prompt, params.messages)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = `你是「人设故事官」。把用户提供的来时路素材，整理成一条置顶视频脚本。

【输出规则 — 严格遵循】
- 只输出两部分：「来时路总结」一段（150 字内）+「置顶视频脚本」逐句口播与配图建议
- 脚本逐句成行，每句格式为"口播：xxx ｜ 配图：xxx"，10-18 句
- 口语、真诚、像本人说话；避免 AI 腔、宣传腔、整齐排比、万能结尾
- 不主动提过时热点或已过气的网络梗
- 不暴露内部参考来源`

    const systemPrompt = `${agentPrompt}

${context.knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户提供的来时路素材：
"${context.rawInput}"

${workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : ""}请直接输出「来时路总结 + 置顶视频脚本」，不要包含任何解释性文字。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: rawText,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      raw_copy: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: [{ format: "video_script" as ContentFormat, content: rawText, wordCount: rawText.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 前采模式检测 ───────────────────────────────────────────

export function detectPersonaMode(input: string): "guided" | "intake" | "intake_compile" {
  const text = input.trim()
  if (text.includes("开始整理")) return "intake_compile"
  const intakeKeywords = ["前采", "访谈", "录音", "整理", "报告", "资料整理", "逐字稿"]
  if (intakeKeywords.some((kw) => text.includes(kw))) return "intake"
  return "guided"
}

// ─── 调度与分流器 ───────────────────────────────────────────

const HANDLERS: Record<AimAgentId, AimAgentHandler> = {
  content_producer: new ContentProducerHandler(),
  free_copywriter: new FreeCopywriterHandler(),
  deep_copywriter: new DeepCopywriterHandler(),
  business_system_diagnosis: new BusinessSystemDiagnosisHandler(),
  business_diagnosis: new BusinessDiagnosisHandler(),
  content_review: new ContentReviewHandler(),
  persona: new PersonaHandler(),
}

const VALID_AGENT_IDS = new Set<string>([
  "content_producer",
  "free_copywriter",
  "deep_copywriter",
  "business_system_diagnosis",
  "business_diagnosis",
  "content_review",
  "persona",
])

/**
 * 向后兼容别名 → 内部 handler ID 映射。
 * 内容生产官的公开 id 已从 "ip_video" 统一为 "content_producer"，但旧书签链接、
 * 旧外部 API 调用、旧 AimGeneration 数据库行仍可能携带 "ip_video"，这里兜底归一化，
 * 确保历史数据和历史调用方不因重命名而失效。
 */
const AGENT_ID_ALIASES: Record<string, AimAgentId> = {
  ip_video: "content_producer",
}

export function getAgentHandler(agentId: string): AimAgentHandler {
  // 1. 直接命中
  if (VALID_AGENT_IDS.has(agentId)) {
    return HANDLERS[agentId as AimAgentId]
  }
  // 2. 尝试别名映射
  const aliased = AGENT_ID_ALIASES[agentId]
  if (aliased && VALID_AGENT_IDS.has(aliased)) {
    return HANDLERS[aliased]
  }
  // 3. 回退到默认 handler
  return HANDLERS.content_producer
}

/**
 * 统一 chat 处理入口
 */
async function buildAimChatRuntime(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">
): Promise<{ handler: AimAgentHandler; params: AimChatParams }> {
  const compressed = await runAimTraceStep(
    params.trace,
    "compress_messages",
    "上下文压缩",
    () => compressAimMessages(agentId, params.messages),
    (result) => ({
      summary: result.didCompress ? "已压缩长对话" : "无需压缩",
      metadata: { messageCount: params.messages.length, didCompress: result.didCompress },
    }),
  )
  const enrichedKnowledgeBlock = compressed.didCompress
    ? `【对话摘要】\n${compressed.summary}\n\n${params.knowledgeBlock}`
    : params.knowledgeBlock
  const conversationBlock = params.conversationIntent
    ? buildConversationIntentBlock(params.conversationIntent)
    : ""

  const [methodologyBlock, businessDiagnosisBlock, ipWikiBlock] = await runAimTraceStep(
    params.trace,
    "build_runtime_context",
    "方法论/IP Wiki 上下文",
    () => Promise.all([
      params.conversationIntent?.useMethodology === false ? Promise.resolve("") : buildIpCopywritingMethodologyBlock(),
      params.conversationIntent?.useMethodology === false || agentId !== "business_system_diagnosis"
        ? Promise.resolve("")
        : buildBusinessDiagnosisMethodologyBlock(),
      params.conversationIntent?.useMethodology === false || !params.projectId
        ? Promise.resolve("")
        : buildIpWikiBlock({ projectId: params.projectId }),
    ]),
    ([methodology, businessDiagnosis, ipWiki]) => ({
      summary: "运行上下文已构建",
      metadata: {
        methodologyChars: methodology.length,
        businessDiagnosisChars: businessDiagnosis.length,
        ipWikiChars: ipWiki.length,
      },
    }),
  )

  return {
    handler: getAgentHandler(agentId),
    params: {
      ...params,
      conversationBlock,
      knowledgeBlock: enrichedKnowledgeBlock,
      methodologyBlock,
      businessDiagnosisBlock,
      ipWikiBlock,
    },
  }
}

export async function buildAimChatResponse(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">,
): Promise<AimChatResponse> {
  const runtime = await buildAimChatRuntime(agentId, params)
  return runAimTraceStep(
    params.trace,
    "llm_chat",
    "LLM 聊天生成",
    () => runtime.handler.chat(runtime.params),
    (result) => ({ outputSummary: summarizeText(result.content) }),
  )
}

export async function* buildAimChatResponseStream(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">
): AsyncIterable<string> {
  const runtime = await buildAimChatRuntime(agentId, params)
  yield* runtime.handler.streamChat(runtime.params)
}

/**
 * 统一 generate 处理入口
 */
export async function buildAimGeneration(agentId: string, params: Omit<AimGenerateContext, "agentId" | "knowledgeBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "viralStructureBlock" | "eventStorytellingBlock" | "ipWikiBlock" | "retrievedEntries" | "retrievedSource" | "knowledgeStrategy">): Promise<AimGenerateResponse> {
  const handler = getAgentHandler(agentId)

  // 1. 项目校验
  await runAimTraceStep(params.trace, "project_check", "项目权限校验", async () => {
    if (!params.projectId) return { checked: false }
    const project = await prisma.clientProject.findFirst({
      where: {
        id: params.projectId,
        userId: params.userId,
        status: "active",
      },
      select: { id: true },
    })
    if (!project) throw new Error("客户项目不存在或已归档")
    return { checked: true }
  }, (result) => ({
    summary: result.checked ? "项目有效" : "无项目模式",
    metadata: result,
  }))

  const runtimeTask = await runAimTraceStep(
    params.trace,
    "resolve_runtime_task",
    "任务类型识别",
    () => params.runtimeTask ?? resolveAimRuntimeTask({
      agentId,
      input: params.rawInput,
      taskType: params.taskType,
      polishInstruction: params.polishInstruction,
      targetFormats: params.targetFormats,
    }),
    (task) => ({ summary: task, metadata: { runtimeTask: task } }),
  )
  const generationIntent = await runAimTraceStep(
    params.trace,
    "resolve_generation_intent",
    "生成模式识别",
    async () =>
      resolveAimConversationIntentWithRules({
        agentId,
        messages: [
          {
            role: "user",
            content: [params.rawInput, params.polishInstruction].filter(Boolean).join("\n"),
          },
        ],
      }).intent,
    (intent) => ({
      summary: intent.mode,
      metadata: {
        useKnowledge: intent.useKnowledge,
        useMethodology: intent.useMethodology,
      },
    }),
  )

  // 2. 解析知识调用策略（决定本次调多少知识、侧重哪类）
  const knowledgeStrategy = await runAimTraceStep(
    params.trace,
    "resolve_knowledge_strategy",
    "知识调用策略解析",
    () => resolveKnowledgeStrategy({
      runtimeTask,
      topicType: params.topicType,
      hotTopic: params.hotTopic,
      videoCopyExtractionId: params.videoCopyExtractionId,
      taskType: params.taskType,
      polishInstruction: params.polishInstruction,
      contentScenario: params.contentScenario,
    }),
    (strategy) => ({ summary: strategy, metadata: { strategy } }),
  )

  // 3. 并行读取通用背景资产（统一知识上下文，按策略画像调用）
  //    事件内容化方法论按需加载：仅当创作属于"现场/事件复盘类"时注入，避免噪声
  const useEventStorytelling = shouldUseEventStorytelling({
    rawInput: params.rawInput,
    topicTitle: params.topicTitle,
    topicType: params.topicType,
    topicRationale: params.topicRationale,
  })
  const [knowledgeCtx, viralStructureBlock, methodologyBlock, businessDiagnosisBlock, ipWikiBlock, eventStorytellingBlock] = await runAimTraceStep(
    params.trace,
    "load_generation_context",
    "知识/结构/方法论读取",
    () => Promise.all([
      params.projectId && shouldUseKnowledgeContextForTask(runtimeTask)
        && generationIntent.useKnowledge
        ? buildAimKnowledgeContext({
            userId: params.userId,
            projectId: params.projectId,
            agentId,
            query: params.rawInput,
            topicTitle: params.topicTitle,
            topicRationale: params.topicRationale,
            strategy: knowledgeStrategy,
          })
        : Promise.resolve({
            knowledgeBlock: "",
            entries: [],
            source: "raw" as const,
          }),
      buildViralStructureBlock(),
      generationIntent.useMethodology ? buildIpCopywritingMethodologyBlock() : Promise.resolve(""),
      generationIntent.useMethodology && agentId === "business_system_diagnosis"
        ? buildBusinessDiagnosisMethodologyBlock()
        : Promise.resolve(""),
      generationIntent.useMethodology && params.projectId ? buildIpWikiBlock({ projectId: params.projectId }) : Promise.resolve(""),
      // 仅创作类智能体（内容生产官/深度文案官）+ 命中现场/事件复盘类时加载
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

  // 4. 调用具体的智能体 Handler
  //    加入压缩摘要（如有必要，将用户原始输入视为消息列表）
  const generateMessages = [{ role: "user" as const, content: params.rawInput }]
  const compressed = await runAimTraceStep(
    params.trace,
    "compress_generation_input",
    "生成输入压缩",
    () => compressAimMessages(agentId, generateMessages),
    (result) => ({
      summary: result.didCompress ? "已压缩输入" : "无需压缩",
      metadata: { didCompress: result.didCompress },
    }),
  )
  const knowledgeWithContext = compressed.didCompress
    ? `【对话摘要】\n${compressed.summary}\n\n${knowledgeCtx.knowledgeBlock}`
    : knowledgeCtx.knowledgeBlock

  const response = await runAimTraceStep(params.trace, "agent_generate", "智能体生成并保存", () => handler.generate({
    ...params,
    agentId,
    runtimeTask,
    knowledgeBlock: knowledgeWithContext,
    methodologyBlock,
    businessDiagnosisBlock,
    viralStructureBlock,
    eventStorytellingBlock,
    ipWikiBlock,
    retrievedEntries: knowledgeCtx.entries,
    retrievedSource: knowledgeCtx.source,
    knowledgeStrategy,
  }), (result) => ({
    summary: `生成 ${result.results.length} 个交付物`,
    outputSummary: summarizeText(result.results.map((item) => `${item.format}: ${item.content}`).join("\n")),
    metadata: { resultId: result.id, formats: result.results.map((item) => item.format) },
  }))

  // 5. 后续处理 (Fire-and-forget 向量写入)
  await addAimTraceStep(params.trace, {
    key: "fire_knowledge_embedding",
    label: "知识向量补写",
    status: "success",
    summary: "已触发后台补写",
    metadata: { entries: knowledgeCtx.entries.length },
  })
  fireKnowledgeEmbedding(knowledgeCtx.entries, knowledgeCtx.source)

  const saved = await prisma.aimGeneration.findUnique({
    where: { id: response.id },
    select: { model: true, totalTokens: true },
  }).catch(() => null)
  await finishAimTrace(params.trace, {
    aimGenerationId: response.id,
    model: saved?.model || null,
    totalTokens: saved?.totalTokens || null,
    outputSummary: summarizeText(response.results.map((item) => item.content).join("\n\n")),
  })

  return { ...response, conversationMode: generationIntent.mode, knowledgeStrategy }
}

// ─── 共享辅助函数 ───────────────────────────────────────────

async function executeChatLLM(agentId: string, systemPrompt: string, messages: any[]): Promise<AimChatResponse> {
  const formattedMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: normalizeChatContentForLLM(m.content),
    })),
  ]

  const llm = getAgentLLM(hasImageContent(formattedMessages) ? "vision_analysis" : agentId)
  const completion = await llm.complete({
    messages: formattedMessages,
    temperature: 0.7,
  })

  return {
    content: completion.content,
  }
}

async function* executeChatLLMStream(agentId: string, systemPrompt: string, messages: any[]): AsyncIterable<string> {
  const formattedMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: normalizeChatContentForLLM(m.content),
    })),
  ]

  const llm = getAgentLLM(hasImageContent(formattedMessages) ? "vision_analysis" : agentId)
  yield* llm.stream({
    messages: formattedMessages,
    temperature: 0.7,
  })
}

function hasImageContent(messages: ChatMessage[]): boolean {
  return messages.some((message) =>
    Array.isArray(message.content) && message.content.some((part) => part.type === "image_url")
  )
}

function normalizeChatContentForLLM(content: unknown): ChatMessage["content"] {
  if (!Array.isArray(content)) return String(content || "").trim()
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return null
      const item = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } }
      if (item.type === "text" && typeof item.text === "string") {
        const text = item.text.trim()
        return text ? { type: "text" as const, text } : null
      }
      if (item.type === "image_url" && typeof item.image_url?.url === "string") {
        return { type: "image_url" as const, image_url: { url: item.image_url.url } }
      }
      return null
    })
    .filter((part): part is Exclude<ChatMessage["content"], string>[number] => part !== null)
}

async function executeGenerateLLM(agentId: string, systemPrompt: string, userPrompt: string) {
  const llm = getAgentLLM(agentId)
  return llm.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    maxTokens: 4000,
  })
}

function buildWorkflowContext(context: AimGenerateContext): string {
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

export function extractBenchmarkOriginalCopy(rawInput: string) {
  const marker = rawInput.match(/对标原文[：:]\s*/)
  if (marker?.index == null) return ""
  const rest = rawInput.slice(marker.index + marker[0].length).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|来源链接|字数硬规则|硬规则|===)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

function normalizeCopyForCompare(text: string) {
  return text.replace(/\s+/g, "").replace(/[，。！？、；：,.!?;:"“”‘’'（）()《》【】\[\]{}]/g, "")
}

export function benchmarkCopyReuseRatio(benchmark: string, output: string, size = 12) {
  const source = normalizeCopyForCompare(benchmark)
  const target = normalizeCopyForCompare(output)
  if (source.length < size || target.length < size) return source && target && source.includes(target) ? 1 : 0

  const sourceChunks = new Set<string>()
  for (let index = 0; index <= source.length - size; index += 1) {
    sourceChunks.add(source.slice(index, index + size))
  }

  let reused = 0
  const total = target.length - size + 1
  for (let index = 0; index <= target.length - size; index += 1) {
    if (sourceChunks.has(target.slice(index, index + size))) reused += 1
  }

  return total > 0 ? reused / total : 0
}

export function isBenchmarkCopyTooSimilar(rawInput: string, output: string) {
  const benchmark = extractBenchmarkOriginalCopy(rawInput)
  const source = normalizeCopyForCompare(benchmark)
  const target = normalizeCopyForCompare(output)
  if (source.length < 30 || target.length < 30) return false
  if (source === target || source.includes(target) || target.includes(source)) return true
  return benchmarkCopyReuseRatio(benchmark, output) >= 0.35
}

async function executeGenerateLLMWithBenchmarkRetry(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  context: AimGenerateContext,
  targetFormats: ContentFormat[],
) {
  const completion = await executeGenerateLLM(agentId, systemPrompt, userPrompt)
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

  const retryCompletion = await executeGenerateLLM(agentId, systemPrompt, retryPrompt)
  return {
    completion: retryCompletion,
    parsed: parseMultiFormatResponse(retryCompletion.content, targetFormats),
  }
}

function buildProducerSystemPrompt(agentPrompt: string, context: AimGenerateContext): string {
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
- 如果信息不足，基于企业知识库、用户输入和现有上下文做合理假设，并在文案里自然处理。
- 成稿前做内部质检：是否遵守用户修改意图、是否保留原文有效表达、是否过度调用背景导致跑题、是否有明显 AI 套话；除非用户要求，不要输出质检报告。

对标改写硬规则：
${BENCHMARK_REWRITE_GUARDRAIL}

请严格按照下方每种格式的要求，生成对应的内容。每种格式用 ===FORMAT:格式名=== 作为分隔标记。`
}

function buildUserPrompt(context: AimGenerateContext, formatBlocks: string): string {
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

async function saveAimGenerationRecord(
  context: AimGenerateContext,
  completion: any,
  parsed: Record<ContentFormat, string | undefined>
) {
  const clampVarchar = (value: string | null | undefined, max = 191) =>
    value ? value.slice(0, max) : null

  const sanitizeDbText = (value: string | null | undefined) =>
    value ? value.replace(/\u0000/g, "").replace(/[\u{10000}-\u{10FFFF}]/gu, "") : null

  const knowledgeUsed = context.retrievedEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
  }))

  const data = {
    userId: context.userId,
    agentId: context.agentId,
    projectId: context.projectId || null,
    rawInput: sanitizeDbText(context.rawInput) ?? "",
    inputSource: "text",
    videoScript: sanitizeDbText(parsed.video_script),
    wechatArticle: sanitizeDbText(parsed.wechat_article),
    momentsPost: sanitizeDbText(parsed.moments_post),
    communityMessage: sanitizeDbText(parsed.community_message),
    shootingBrief: sanitizeDbText(parsed.shooting_brief),
    rawCopy: sanitizeDbText(parsed.raw_copy),
    formatsRequested: context.targetFormats,
    knowledgeUsed,
    topicTitle: clampVarchar(context.topicTitle),
    hotTopic: clampVarchar(context.hotTopic),
    polishInstruction: sanitizeDbText(context.polishInstruction),
    model: completion.model,
    totalTokens: completion.usage?.totalTokens || null,
    status: "completed",
  }

  const degradedData = {
    ...data,
    rawInput: "[omitted: original input could not be persisted safely]",
    videoScript: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    polishInstruction: null,
  }

  const persist = (payload: typeof data) => {
    if (context.existingGenerationId) {
      return prisma.aimGeneration.findFirst({
        where: { id: context.existingGenerationId, userId: context.userId },
        select: { id: true },
      }).then((existing) => {
        if (existing) {
          return prisma.aimGeneration.update({
            where: { id: existing.id },
            data: payload,
          })
        }
        return prisma.aimGeneration.create({ data: payload })
      })
    }

    return prisma.aimGeneration.create({ data: payload })
  }

  try {
    return await persist(data)
  } catch (error) {
    console.error("[aim/generate] history persist failed, retrying with degraded payload", error)
  }

  return persist(degradedData)
}
