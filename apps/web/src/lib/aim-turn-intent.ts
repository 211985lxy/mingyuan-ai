/**
 * 本轮意图契约（Intent-first）
 *
 * 优先于内部「任务类型」枚举：先用一句话说清用户这轮要什么，
 * 再映射到 runtimeTask / 知识策略。任务类型 LLM 调优等有用量后再做。
 */

import { formatLabelForTaskSpec, inferContentFormatsFromRawInput } from "@/lib/aim-format-inference"
import type { ContentFormat } from "@/lib/aim-generator"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import { LOCAL_EDIT_PART_WORDS } from "@/lib/aim-intent-boundaries"

export type AimTurnIntentAction =
  | "create"
  | "local_edit"
  | "rewrite"
  | "review"
  | "position"
  | "chat"

export type AimTurnIntentScope =
  | "opening"
  | "title"
  | "ending"
  | "cta"
  | "full"
  | "unspecified"

export interface AimTurnIntent {
  /** 给模型与用户看的一句话意图 */
  summary: string
  action: AimTurnIntentAction
  scope: AimTurnIntentScope
  /** 交付物可读名，如「小红书图文」「口播脚本」 */
  deliverable: string
  /** 必须保留 */
  keep: string[]
  /** 明确禁止 */
  avoid: string[]
  /** 档案缺口（缺卖点/案例等），生成前应提示用户 */
  archiveGaps: string[]
  /** 用户在确认条补充的说明（不改变 action/scope） */
  userSupplement?: string
}

export interface AimArchiveGapInput {
  /** 是否已选客户项目 */
  hasProject?: boolean
  /** 知识库条数（客户端可知时传入） */
  knowledgeCount?: number
  /** 已确认事实条数 */
  knownFactCount?: number
  /** 任务单 unknowns */
  unknowns?: string[]
  /** 是否有可识别卖点/产品信息 */
  hasOfferSignal?: boolean
  /** 是否有案例类信号 */
  hasCaseSignal?: boolean
}

/**
 * 评估档案是否足以支撑「针对性文案」。缺口写入意图，供确认条与 prompt 使用。
 */
export function assessArchiveGaps(
  intent: Pick<AimTurnIntent, "action">,
  archive?: AimArchiveGapInput,
): string[] {
  if (intent.action === "local_edit" || intent.action === "chat" || intent.action === "review") {
    return []
  }
  const gaps: string[] = []
  if (archive?.hasProject === false) {
    gaps.push("未绑定客户项目：成稿难贴合该 IP，建议先选择项目")
  }
  // 仅在客户端/服务端显式给出条数时判定为空，避免「未传」被当成 0
  const knowledgeKnown = archive?.knowledgeCount !== undefined || archive?.knownFactCount !== undefined
  if (
    knowledgeKnown
    && (archive?.knowledgeCount ?? 0) === 0
    && (archive?.knownFactCount ?? 0) === 0
  ) {
    gaps.push("知识库/已知事实为空：缺少可追溯卖点或案例，成稿易空泛")
  }
  if (archive?.hasOfferSignal === false) {
    gaps.push("未见产品/服务卖点：转化类文案缺少承接依据")
  }
  if (
    (intent.action === "create" || intent.action === "rewrite")
    && archive?.hasCaseSignal === false
    && (archive?.knowledgeCount ?? 0) > 0
  ) {
    // 有知识但无案例信号时弱提示
    gaps.push("未见明确客户案例：若要强信任，请补充一条可引用案例")
  }
  for (const u of archive?.unknowns ?? []) {
    if (/案例|卖点|目标客户|真实问题/.test(u) && !gaps.some((g) => g.includes(u.slice(0, 8)))) {
      gaps.push(u)
    }
  }
  return gaps.slice(0, 4)
}

function includesAny(text: string, words: readonly string[] | string[]): boolean {
  return words.some((w) => text.includes(w))
}

function resolveScope(text: string): AimTurnIntentScope {
  if (includesAny(text, ["开头", "前3秒", "前三秒", "第一句话", "第一句", "钩子", "起手", "开场"])) {
    return "opening"
  }
  if (text.includes("标题")) return "title"
  if (includesAny(text, ["结尾", "收尾"])) return "ending"
  if (includesAny(text, ["CTA", "行动引导", "引导句"])) return "cta"
  if (includesAny(text, ["整篇", "全文", "整版"])) return "full"
  return "unspecified"
}

function resolveDeliverable(rawInput: string, targetFormats?: ContentFormat[]): string {
  if (targetFormats?.length) {
    return targetFormats.map((f) => formatLabelForTaskSpec(f)).join("、")
  }
  const inferred = inferContentFormatsFromRawInput(rawInput)
  if (inferred.length) return inferred.map((f) => formatLabelForTaskSpec(f)).join("、")
  if (/朋友圈/.test(rawInput)) return "朋友圈文案"
  if (/小红书|种草/.test(rawInput)) return "小红书图文"
  if (/口播|短视频|抖音/.test(rawInput)) return "口播脚本"
  if (/公众号/.test(rawInput)) return "公众号文章"
  return "文案成稿"
}

function actionFromRuntimeTask(task?: AimRuntimeTask): AimTurnIntentAction | null {
  if (!task) return null
  if (task === "light_edit") return "local_edit"
  if (task === "rewrite_copy") return "rewrite"
  if (task === "new_copy") return "create"
  if (task === "quality_review") return "review"
  if (task === "positioning_topic") return "position"
  return null
}

const STRONG_WRITE_WORDS = [
  "写一篇", "写一版", "写一条", "帮我写", "种草", "出一版", "出一条", "生成", "创作",
  "重写", "改写", "重新写", "大改", "重做",
] as const

/** 结构拆解 / 优化建议问句：应走对话，禁止擅自出整篇成稿 */
const COPY_ANALYSIS_PATTERN =
  /结构是什么|什么结构|文案结构|讲讲结构|怎么拆|拆解|分析一下|分析这|分析下|点评一下|点评这|点评下|评价一下|评一下这|这篇.{0,8}结构|这版.{0,8}结构|这个文案结构|结构图解|段落作用|怎么优化|如何优化|该怎么(?:改|优化)|有没有问题|又没有问题|有没有毛病|哪里有问题|问题在哪|哪里不对|哪里需要改|怎么改更好|优化建议|帮我看看这篇|检查一下(?:这篇|这版|逻辑)|文案逻辑|逻辑(?:有问题|对不对|通不通)|哪里薄弱|痛点是不是太散|优化这篇|优化这条|优化一下这篇|优化一下这条|帮我优化|看看这篇|这篇有什么问题|有什么问题|哪里不行|先别重写|告诉我怎么改|该怎么改|问题多不多/

/** 显式要求「直接改出修改稿」时才走润色交付，避免「优化这篇」被当成再生成一篇 */
const POLISH_EXECUTE_WORDS = [
  "直接改", "直接优化", "改好这篇", "改好这条", "改顺", "别扩写", "不要扩写",
  "保持篇幅", "输出修改稿", "给我修改稿", "润色并输出", "改短一点", "改长一点",
] as const

const PASSAGE_SCOPED_WORDS = [
  "这段话", "这段文字", "这段表述", "这段", "这句话", "这一句",
] as const

const PASSAGE_POLISH_WORDS = [
  "优化", "润色", "顺一下", "顺一点", "改顺", "自然点", "更自然", "口语化",
  "改一下", "改改", "润一润", "写短", "缩短", "精简", "压缩一下", "啰嗦", "太长",
] as const

const PASSAGE_REF_WORDS = [
  "这篇", "这条", "这段", "这段话", "这段文字", "原稿", "原文", "上述", "上面", "这一版", "稿子",
] as const

/** 短指令「帮我润色下」：无指代也默认轻改，避免 new_copy 误建整篇 */
const BARE_POLISH_PATTERN = /^(?:帮我)?(?:润色|优化|顺一下|改改|改一下)(?:一下|下|下吧)?[。.!！？?]*$/

export function looksLikeCopyAnalysisQuestion(text: string): boolean {
  // 点名开头/标题等局部部位时，优先走部位轻改，不要当成「整篇怎么优化」建议问句
  if (includesAny(text, [...LOCAL_EDIT_PART_WORDS])) return false
  return COPY_ANALYSIS_PATTERN.test(text) && !includesAny(text, [...STRONG_WRITE_WORDS])
}

/** 优化/润色已粘贴或点名的这段：走轻改，禁止扩成全新长稿。
 * 整篇级「优化这篇」默认给建议（chat）；点名「这段话」或带「直接改」等执行词才润色出稿。
 * 若已点名开头/标题等局部部位，交给部位轻改规则，不走段落润色。
 */
export function looksLikePassagePolish(text: string): boolean {
  if (includesAny(text, [...LOCAL_EDIT_PART_WORDS])) return false
  if (looksLikeCopyAnalysisQuestion(text)) return false
  if (includesAny(text, [...STRONG_WRITE_WORDS])) return false

  const passageScoped = includesAny(text, [...PASSAGE_SCOPED_WORDS])
  const executePolish = includesAny(text, [...POLISH_EXECUTE_WORDS])
  const hasPolishVerb = includesAny(text, [...PASSAGE_POLISH_WORDS])
  const hasPassageRef = includesAny(text, [...PASSAGE_REF_WORDS])

  // 显式「直接改好/输出修改稿」：即使没有「优化/润色」也算润色出稿
  if (executePolish && hasPassageRef) return true
  if (executePolish && passageScoped) return true
  if (BARE_POLISH_PATTERN.test(text.trim())) return true
  if (!hasPolishVerb) return false
  // 「优化这篇/这条」无执行词 → 不当润色出稿（由 analysis 或默认 chat 处理）
  if (!passageScoped) return false
  return true
}

/**
 * 从用户输入规则推导本轮意图（不调用 LLM）。
 */
export function resolveAimTurnIntent(input: {
  rawInput: string
  runtimeTask?: AimRuntimeTask
  targetFormats?: ContentFormat[]
  polishInstruction?: string
  archive?: AimArchiveGapInput
  /** 向量/外部覆盖：强制行动与范围 */
  forceAction?: AimTurnIntentAction
  forceScope?: AimTurnIntentScope
}): AimTurnIntent {
  const text = `${input.rawInput || ""} ${input.polishInstruction || ""}`.trim()
  const deliverable = resolveDeliverable(input.rawInput || "", input.targetFormats)
  let scope = resolveScope(text)

  let action = actionFromRuntimeTask(input.runtimeTask) || "chat"

  // 输入信号可覆盖/细化（意图优先于模糊任务类型）
  // 优化建议/分析问句优先于「优化这篇」润色，避免问怎么改却直接出新稿
  if (looksLikeCopyAnalysisQuestion(text)) {
    action = "chat"
  } else if (
    includesAny(text, [...LOCAL_EDIT_PART_WORDS])
    && includesAny(text, ["优化", "改", "润色", "调整", "只改", "只优化"])
    && !includesAny(text, ["重写", "改写", "重做", "整篇"])
  ) {
    action = "local_edit"
  } else if (looksLikePassagePolish(text)) {
    action = "local_edit"
  } else if (includesAny(text, ["重写", "改写", "重新写", "大改", "重做"])) {
    action = "rewrite"
  } else if (includesAny(text, ["写一篇", "写一版", "写一条", "帮我写", "种草", "出一版", "出一条", "生成", "创作"])) {
    action = "create"
  } else if (includesAny(text, ["质检", "检查一下", "发布前"])) {
    action = "review"
  } else if (
    includesAny(text, ["人设梳理", "定位策划", "账号方向"])
    && !includesAny(text, ["种草", "小红书", "口播", "文案"])
  ) {
    action = "position"
  }

  if (input.forceAction) action = input.forceAction
  if (input.forceScope) scope = input.forceScope

  // 分析/建议问句优先于 runtimeTask 带来的 create/rewrite，以及段落润色
  if (!input.forceAction && looksLikeCopyAnalysisQuestion(text)) {
    action = "chat"
  } else if (!input.forceAction && looksLikePassagePolish(text)) {
    action = "local_edit"
  }

  // create 表示从零交付完整成稿。输入里的“结尾/CTA”常是新稿约束，不能把
  // 整条生成缩成局部编辑；真正只改结尾必须由 local_edit 表达。
  if (action === "create") scope = "full"

  const keep: string[] = []
  const avoid: string[] = []
  const passagePolish = looksLikePassagePolish(text)

  if (action === "local_edit") {
    keep.push("原稿主题与未点名部分")
    if (passagePolish) {
      keep.push("用户粘贴原文的信息点与相近篇幅")
      avoid.push("扩写成全新长口播", "另起一篇成稿", "擅自拉长数倍")
    } else if (scope === "opening") {
      keep.push("正文主体与结尾")
      avoid.push("输出整篇文案", "擅自扩写知识库背景")
    } else if (scope === "title") {
      avoid.push("改正文", "输出整篇")
    } else if (scope === "ending") {
      keep.push("开头与正文主体")
      avoid.push("重写全文")
    } else {
      avoid.push("整篇重写", "跑题换选题")
    }
  } else if (action === "create") {
    keep.push("本轮明确选题与交付格式")
    avoid.push("编造无依据的第一人称案例", "空泛开场套话")
  } else if (action === "rewrite") {
    keep.push("原选题核心")
    avoid.push("照抄原句", "另起一个主题")
  } else if (action === "chat" && looksLikeCopyAnalysisQuestion(text)) {
    keep.push("针对用户点名文案的问题诊断与最小改法说明")
    avoid.push("擅自输出整篇成稿", "另起一篇口播或种草文", "用新稿代替优化建议")
  }

  if (/别越改越短|保持原稿|不要压缩|保持体量/.test(text)) {
    keep.push("原稿信息密度与篇幅")
    avoid.push("主动缩成短版")
  }

  const scopeLabel: Record<AimTurnIntentScope, string> = {
    opening: "只改开头/钩子",
    title: "只改标题",
    ending: "只改结尾",
    cta: "只改行动引导",
    full: "整篇",
    unspecified: "按用户点名范围",
  }

  const actionLabel: Record<AimTurnIntentAction, string> = {
    create: "新建成稿",
    local_edit: "局部修改",
    rewrite: "重写/对标改写",
    review: "质检",
    position: "定位/人设梳理",
    chat: "对话协助",
  }

  const summary = action === "local_edit" && passagePolish
    ? "本轮意图：局部修改——在用户粘贴原文上润色优化；保持相近篇幅，禁止扩成全新长稿。"
    : action === "local_edit"
      ? `本轮意图：${actionLabel[action]}——${scopeLabel[scope]}（交付：${deliverable}）；未点名部分一律保留。`
      : action === "chat" && looksLikeCopyAnalysisQuestion(text)
        ? "本轮意图：对话协助——诊断问题并给优化建议/结构说明；禁止擅自另写整篇成稿。"
        : `本轮意图：${actionLabel[action]}，交付「${deliverable}」；严格按用户本轮要求执行，不得擅自扩大任务范围。`

  const draft: AimTurnIntent = {
    summary,
    action,
    scope,
    deliverable,
    keep,
    avoid,
    archiveGaps: [],
  }
  draft.archiveGaps = assessArchiveGaps(draft, input.archive)
  if (draft.archiveGaps.length) {
    draft.avoid = [...new Set([
      ...draft.avoid,
      "把档案缺口编成事实",
      "用空泛套话填补缺失卖点/案例",
    ])]
  }
  return draft
}

/**
 * 渲染为 prompt 最高优先级意图块。
 */
export function formatAimTurnIntentBlock(intent: AimTurnIntent): string {
  const lines = [
    "【本轮意图】（最高优先级，高于方法论、知识库与默认模板）",
    intent.summary,
    `- 行动：${intent.action}`,
    `- 范围：${intent.scope}`,
    `- 交付物：${intent.deliverable}`,
  ]
  if (intent.keep.length) lines.push(`- 必须保留：${intent.keep.join("；")}`)
  if (intent.avoid.length) lines.push(`- 禁止：${intent.avoid.join("；")}`)
  if (intent.archiveGaps?.length) {
    lines.push(`- 档案缺口（不得编造填补，对应处写「未提供/待补充」）：${intent.archiveGaps.join("；")}`)
  }
  if (intent.userSupplement?.trim()) {
    lines.push(`- 用户补充说明：${intent.userSupplement.trim()}`)
  }
  lines.push("若与其它上下文冲突，以本轮意图为准。")
  return lines.join("\n")
}

/** 用户确认后的意图覆写：保留结构，只更新摘要/保留/禁止 */
export function applyTurnIntentEdits(
  base: AimTurnIntent,
  edits: { summary?: string; keep?: string[]; avoid?: string[] },
): AimTurnIntent {
  return {
    ...base,
    summary: edits.summary?.trim() || base.summary,
    keep: edits.keep?.length ? edits.keep : base.keep,
    avoid: edits.avoid?.length ? edits.avoid : base.avoid,
  }
}

/** 确认条「补充说明」：不改 action/scope/keep/avoid，只附加用户注记 */
export function applyTurnIntentSupplement(base: AimTurnIntent, note: string): AimTurnIntent {
  const trimmed = note.trim()
  if (!trimmed) return { ...base, userSupplement: undefined }
  return {
    ...base,
    userSupplement: trimmed.slice(0, 500),
  }
}

const TURN_INTENT_ACTIONS = new Set<AimTurnIntentAction>([
  "create", "local_edit", "rewrite", "review", "position", "chat",
])
const TURN_INTENT_SCOPES = new Set<AimTurnIntentScope>([
  "opening", "title", "ending", "cta", "full", "unspecified",
])

/** 校验并归一化前端回传的确认意图 */
export function normalizeConfirmedTurnIntent(value: unknown): AimTurnIntent | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const action = typeof v.action === "string" && TURN_INTENT_ACTIONS.has(v.action as AimTurnIntentAction)
    ? (v.action as AimTurnIntentAction)
    : null
  const scope = typeof v.scope === "string" && TURN_INTENT_SCOPES.has(v.scope as AimTurnIntentScope)
    ? (v.scope as AimTurnIntentScope)
    : "unspecified"
  const summary = typeof v.summary === "string" ? v.summary.trim() : ""
  const deliverable = typeof v.deliverable === "string" ? v.deliverable.trim() : ""
  if (!action || !summary || !deliverable) return null
  const asStringList = (x: unknown) =>
    Array.isArray(x) ? x.filter((i): i is string => typeof i === "string" && i.trim().length > 0).map((i) => i.trim()) : []
  return {
    summary: summary.slice(0, 500),
    action,
    scope,
    deliverable: deliverable.slice(0, 120),
    keep: asStringList(v.keep).slice(0, 8),
    avoid: asStringList(v.avoid).slice(0, 8),
    archiveGaps: asStringList(v.archiveGaps).slice(0, 4),
    userSupplement: typeof v.userSupplement === "string" && v.userSupplement.trim()
      ? v.userSupplement.trim().slice(0, 500)
      : undefined,
  }
}

/** 需要生成前意图确认的行动类型 */
export function shouldConfirmTurnIntent(intent: AimTurnIntent): boolean {
  return intent.action === "create"
    || intent.action === "rewrite"
    || intent.action === "local_edit"
    || intent.action === "position"
}
