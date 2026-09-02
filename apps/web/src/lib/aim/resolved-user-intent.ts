import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import type { ContentFormat } from "@/lib/api/client"

/**
 * 用户指令唯一真源 —— 意图解析与关键缺口检查。
 *
 * 职责（与 LLM 语义理解互补，规则可测）：
 * 1. 从「当前用户原话 + 本任务已确认回答 + 素材」确定性解析 ResolvedUserIntent；
 * 2. 按任务类型检查会实质改变成稿的关键缺口（主题/受众/目标/长度/数量/修改范围/新旧任务）；
 * 3. 缺口一次性输出最多 3 个编号追问，绝不使用隐藏默认值顶替。
 *
 * 约束优先级（固定）：当前用户明确要求 > 本任务已确认要求 > 当前素材可直接确定的信息。
 * 历史任务、项目档案、平台模板不得成为硬约束（只作参考）。
 */

export type AimIntentTaskKind =
  | "new_draft"
  | "polish_existing"
  | "benchmark_rewrite"
  | "batch_replicate"
  | "imitation_rewrite"
  | "opener_optimize"
  | "answer_question"

export type AimContentGoal = "traffic" | "lead" | "convert" | "trust" | "brand"

export type IntentConstraintSource = "user_current" | "task_confirmed" | "material_derived"

export interface ResolvedUserIntent {
  taskKind: AimIntentTaskKind
  /** 任务对象描述（新稿 / 当前作品 / 对标原文 / 粘贴素材） */
  taskObject: string
  /** 修改范围（开头/结尾/某段/全文），仅修改类任务 */
  modificationScope?: string
  topic?: string
  audience?: string
  goal?: AimContentGoal
  /** 长度策略：用户显式给出 / 保持原体量（用户点名）/ 素材可推导（改写完整原稿）/ 未定 */
  lengthPolicy: "user_explicit" | "keep_original" | "material_derived" | "unset"
  lengthText?: string
  /** 数量（条/版/篇），仅批量/开头/仿写类任务关心 */
  quantity?: number
  /** 目标格式（来自请求 targetFormats，不属于用户追问范围） */
  formats?: ContentFormat[]
  /** 是否明显开启新任务（新主题/新交付物且无「这篇/上一版/继续」指代） */
  isNewTask: boolean
  /** 每个已确认字段的来源（约束来源记录） */
  constraintSources: Partial<Record<"topic" | "audience" | "goal" | "length" | "quantity" | "modificationScope", IntentConstraintSource>>
}

export interface IntentClarificationGap {
  field: "topic" | "audience" | "goal" | "length" | "quantity" | "modificationScope" | "taskBoundary"
  question: string
}

/** 追问引导语；同时用于识别「用户正在回答追问」的轮次（不重复追问） */
export const AIM_CLARIFICATION_LEAD = "在动笔前先确认"

const CLARIFICATION_LEAD_PATTERN = new RegExp(`^${AIM_CLARIFICATION_LEAD}`)

const GENERIC_TOPICLESS_REQUEST = /^(?:请|帮我|麻烦)?(?:写|生成|创作|出)(?:一[条篇版个]?|个)?(?:文案|口播|内容|脚本|文章)?.{0,6}$/

const LENGTH_EXPLICIT_PATTERN = /(\d+(?:\.\d+)?)\s*(?:分钟|分)|(?:\d{2,5})\s*字|\d+\s*字以内|一句话|短口播/
const LENGTH_KEEP_ORIGINAL_PATTERN = /(保持|维持|保留|别改短|不要缩短|别越改越短).{0,10}(体量|字数|长度|篇幅)|(保持|维持|保留)(原稿|原文|原版|当前稿)/
const SCOPE_PATTERN = /开头|标题|结尾|CTA|行动引导|第[一二三四五六七八九十]+段|某[一段句]|整篇|整稿|全文|通篇|终稿|这篇|逐段|直接给/
const AUDIENCE_PATTERN = /(写给|面向|针对|目标客户|目标人群|受众|适合|给.{1,12}(老板|宝妈|家长|学员|客户|用户|新人|小白|中小企业|实体店|门店|律师|会计|医生|教师|代理|微商|创始人|高管))/
const NEW_TASK_SIGNAL_PATTERN = /(新任务|重新开一题|换个话题|换个主题|接下来写|下一个选题|新的一篇|另外写|再写一篇(?!.*这篇))/
const FOLLOW_UP_REFERENCE_PATTERN = /(这篇|这一篇|上一版|上一稿|刚才那篇|当前稿|继续改|接着改|在这个基础上|刚才的稿)/
const QUESTION_INTENT_PATTERN = /(?:是什么|什么意思|为什么|怎么看|怎么改|如何优化|哪种|哪个|是否|帮我分析|评价一下)[^。]*[？?]?$/

function lastAssistantTurn(envelope: AimContentSourceEnvelope) {
  for (let i = envelope.relevantConversation.length - 1; i >= 0; i -= 1) {
    if (envelope.relevantConversation[i].role === "assistant") return envelope.relevantConversation[i]
  }
  return null
}

function recentUserText(envelope: AimContentSourceEnvelope, turns = 2): string {
  return envelope.relevantConversation
    .filter((turn) => turn.role === "user")
    .slice(-turns)
    .map((turn) => turn.content)
    .join("\n")
}

/** 用户当前正在回答上一轮追问：跳过确定性缺口追问，避免重复问已确认字段 */
export function isClarificationAnswerTurn(envelope: AimContentSourceEnvelope): boolean {
  const last = lastAssistantTurn(envelope)
  return Boolean(last && CLARIFICATION_LEAD_PATTERN.test(last.content.trim()))
}

function detectGoal(text: string): AimContentGoal | undefined {
  if (/(获客|引流|留资|私信|咨询|线索|线索获客|预约)/.test(text)) return "lead"
  if (/(成交|转化|卖货|下单|购买|招商)/.test(text)) return "convert"
  if (/(人设|信任|故事|来时路|品牌)/.test(text)) return "trust"
  if (/(涨粉|流量|曝光|起号|播放)/.test(text)) return "traffic"
  return undefined
}

function detectQuantity(text: string): number | undefined {
  const digit = text.match(/(?:生成|写|出|做|要|给|复刻)?\s*(\d{1,2})\s*[条个版](?:开头|文案|版本|新文案)?/)
  if (digit) return Number(digit[1])
  const chinese = text.match(/(?:生成|写|出|做|要|给|复刻)?\s*([一二三四五六七八九十])\s*[条个版]/)
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (chinese) return map[chinese[1]]
  return undefined
}

function detectTaskKind(envelope: AimContentSourceEnvelope): AimIntentTaskKind {
  const request = envelope.currentUserRequest
  const hasOriginalMaterial = envelope.referenceMaterials.length > 0
    || Boolean(envelope.currentArtifact?.content?.trim())
  if (/(批量复刻|一次复刻|多条复刻)/.test(request)) return "batch_replicate"
  if (/仿写/.test(request)) return "imitation_rewrite"
  if (/开头/.test(request) && /(优化|改写|重写|推荐|建议|备选)/.test(request)) return "opener_optimize"
  const hasBenchmarkMaterial = /对标原文|对标文案/.test(request)
    || envelope.referenceMaterials.some((item) => /对标|爆款/.test(item.title))
  if (hasBenchmarkMaterial && /(改写|重写|复刻|按|参考)/.test(request)) return "benchmark_rewrite"
  if (/(优化|修改|润色|调整|精修|改一下|改改|帮我改)/.test(request) && hasOriginalMaterial) return "polish_existing"
  if (QUESTION_INTENT_PATTERN.test(request.trim()) && !/(写|生成|出).{0,8}(文案|口播|文章|脚本)/.test(request)) {
    return "answer_question"
  }
  return "new_draft"
}

/**
 * 从信封确定性解析当前意图（规则可测；LLM 语义理解负责模糊语义，二者互补）。
 * 「本任务已确认要求」= 追问后用户的最近回答（recentUserText）。
 */
export function resolveUserIntentFromEnvelope(
  envelope: AimContentSourceEnvelope,
  formats?: ContentFormat[],
): ResolvedUserIntent {
  const request = envelope.currentUserRequest
  // 确定性字段同时扫描：当前原话（最高优先）+ 最近用户回答（本任务已确认）
  const confirmedText = recentUserText(envelope)
  const combinedText = [request, confirmedText].filter(Boolean).join("\n")

  const taskKind = detectTaskKind(envelope)
  const isNewTask = NEW_TASK_SIGNAL_PATTERN.test(request)
    || (!FOLLOW_UP_REFERENCE_PATTERN.test(request) && taskKind === "new_draft" && !envelope.currentArtifact?.content?.trim())

  const sources: ResolvedUserIntent["constraintSources"] = {}
  const audienceInRequest = AUDIENCE_PATTERN.test(request)
  const audienceInConfirmed = !audienceInRequest && AUDIENCE_PATTERN.test(confirmedText)
  const audience = audienceInRequest || audienceInConfirmed
    ? (audienceInRequest ? request : confirmedText)
    : undefined
  if (audienceInRequest) sources.audience = "user_current"
  else if (audienceInConfirmed) sources.audience = "task_confirmed"

  const goalInRequest = detectGoal(request)
  const goalInConfirmed = goalInRequest ?? detectGoal(confirmedText)
  const goal = goalInRequest ?? goalInConfirmed
  if (goalInRequest) sources.goal = "user_current"
  else if (goal) sources.goal = "task_confirmed"

  const explicitLengthInRequest = LENGTH_EXPLICIT_PATTERN.test(request)
  const keepOriginalInRequest = LENGTH_KEEP_ORIGINAL_PATTERN.test(request)
  const explicitLengthInConfirmed = !explicitLengthInRequest && LENGTH_EXPLICIT_PATTERN.test(confirmedText)
  const keepOriginalInConfirmed = !keepOriginalInRequest && LENGTH_KEEP_ORIGINAL_PATTERN.test(confirmedText)
  // 只有润色完整原稿才允许从素材推导体量；对标改写必须由用户选长度策略（保持/自定义/自由）
  const materialDerivesLength = taskKind === "polish_existing"
    && Boolean(
      envelope.referenceMaterials.some((item) => item.content.trim().length >= 120)
        || (envelope.currentArtifact?.content?.trim().length ?? 0) >= 120,
    )
  const lengthPolicy: ResolvedUserIntent["lengthPolicy"] = explicitLengthInRequest || explicitLengthInConfirmed
    ? "user_explicit"
    : keepOriginalInRequest || keepOriginalInConfirmed
      ? "keep_original"
      : materialDerivesLength
        ? "material_derived"
        : "unset"
  if (explicitLengthInRequest || explicitLengthInConfirmed) sources.length = explicitLengthInRequest ? "user_current" : "task_confirmed"

  const quantityInRequest = detectQuantity(request)
  const quantityInConfirmed = quantityInRequest ?? detectQuantity(confirmedText)
  const quantity = quantityInRequest ?? quantityInConfirmed
  if (quantityInRequest) sources.quantity = "user_current"
  else if (quantity) sources.quantity = "task_confirmed"

  const scopeMatch = request.match(SCOPE_PATTERN)
  const modificationScope = scopeMatch?.[0]

  return {
    taskKind,
    taskObject: (taskKind === "polish_existing" || !isNewTask) && envelope.currentArtifact?.content?.trim()
      ? "当前作品"
      : envelope.referenceMaterials.length
        ? "参考材料"
        : "新稿",
    modificationScope,
    topic: GENERIC_TOPICLESS_REQUEST.test(request.trim()) ? undefined : request.trim().slice(0, 120) || undefined,
    audience,
    goal,
    lengthPolicy,
    lengthText: lengthPolicy === "user_explicit"
      ? (request.match(LENGTH_EXPLICIT_PATTERN)?.[0] ?? confirmedText.match(LENGTH_EXPLICIT_PATTERN)?.[0])
      : undefined,
    quantity,
    formats,
    isNewTask,
    constraintSources: sources,
  }
}

/**
 * 按任务类型检查关键缺口（只有会实质改变成稿的字段才追问）：
 * - 新稿：主题、受众、内容目标（形式由 targetFormats 提供，不问）；
 *   篇幅永远不问：字数/时长不是系统的口径，用户给长度就照办，没给就自然收束；
 * - 润色/改写完整原稿：只问修改范围是否清楚；
 * - 批量复刻 / 开头优化 / 仿写：问数量与输出形式；
 * - CTA 只在获客/成交目标已确认时作为要求，不默认追问。
 */
export function collectIntentClarificationGaps(intent: ResolvedUserIntent): IntentClarificationGap[] {
  const gaps: IntentClarificationGap[] = []
  switch (intent.taskKind) {
    case "new_draft": {
      if (!intent.topic && !intent.audience) {
        gaps.push({ field: "topic", question: "这篇内容写什么主题、给谁看？一句话说明即可（例如：写给实体店老板，讲私域获客）。" })
      } else if (!intent.topic) {
        gaps.push({ field: "topic", question: "这篇内容写什么主题？" })
      } else if (!intent.audience) {
        gaps.push({ field: "audience", question: "主要给谁看？（目标人群/客户画像）" })
      }
      if (!intent.goal) {
        gaps.push({ field: "goal", question: "内容目标是什么：搞流量、获客咨询、成交转化，还是建立人设信任？" })
      }
      break
    }
    case "polish_existing": {
      if (!intent.modificationScope) {
        gaps.push({ field: "modificationScope", question: "这次重点改哪里：整篇精修，还是只改开头/结尾/某一段？" })
      }
      break
    }
    case "benchmark_rewrite": {
      // 长度不问也不默认：用户要保体量/给字数会写在原话里，由提示词照办
      break
    }
    case "batch_replicate": {
      if (!intent.quantity) {
        gaps.push({ field: "quantity", question: "要生成几条新文案？" })
      }
      break
    }
    case "imitation_rewrite": {
      if (!intent.quantity) {
        gaps.push({ field: "quantity", question: "要几个仿写版本？没有特别偏好就出一个最匹配原文结构的版本。" })
      }
      break
    }
    case "opener_optimize": {
      if (!intent.quantity) {
        gaps.push({ field: "quantity", question: "要几条开头候选？需要画面建议或推荐榜吗？" })
      }
      break
    }
    case "answer_question":
      break
  }
  return gaps.slice(0, 3)
}

/** 把缺口渲染成一次性编号追问文本（最多 3 问） */
export function buildNumberedClarification(gaps: IntentClarificationGap[]): string | undefined {
  if (!gaps.length) return undefined
  const lines = gaps.map((gap, index) => `${index + 1}. ${gap.question}`)
  return [
    `${AIM_CLARIFICATION_LEAD}${gaps.length > 1 ? ` ${gaps.length} 件事` : " 1 件事"}（直接按编号回答即可，答完我就开写）：`,
    ...lines,
  ].join("\n")
}

/**
 * 合并 LLM 语义理解的追问与确定性缺口追问：按字段去重，最多保留 3 问。
 */
export function mergeClarificationQuestions(
  llmQuestions: string[],
  gaps: IntentClarificationGap[],
): IntentClarificationGap[] {
  const FIELD_HINTS: Array<{ field: IntentClarificationGap["field"]; pattern: RegExp }> = [
    { field: "topic", pattern: /主题|写什么|选题/ },
    { field: "audience", pattern: /给谁|受众|目标客户|人群|读者/ },
    { field: "goal", pattern: /目标|获客|成交|流量|信任|人设|目的/ },
    { field: "length", pattern: /篇幅|多长|字数|时长|分钟|体量|长度/ },
    { field: "quantity", pattern: /几条|几个|多少条|数量|几版|几个版本/ },
    { field: "modificationScope", pattern: /改哪里|修改范围|整篇|只改|开头还是结尾/ },
    { field: "taskBoundary", pattern: /新任务|继续改|这篇|上一版|新的还是继续/ },
  ]
  const covered = new Set<IntentClarificationGap["field"]>()
  const merged: IntentClarificationGap[] = []
  for (const question of llmQuestions) {
    const hit = FIELD_HINTS.find((hint) => hint.pattern.test(question))
    if (hit) covered.add(hit.field)
    merged.push({ field: hit?.field ?? "taskBoundary", question })
  }
  for (const gap of gaps) {
    if (covered.has(gap.field)) continue
    merged.push(gap)
  }
  return merged.slice(0, 3)
}
