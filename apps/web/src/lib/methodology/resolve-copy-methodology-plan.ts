/**
 * 从用户输入 + TaskSpec 解析本轮 IP 方法论计划（意图 → 卡片 → 结构模块）。
 */

import type { TaskSpec } from "@/lib/task-spec"
import {
  type MethodologyBusinessGoal,
  type MethodologyContentRoute,
  type MethodologyLocalOptimize,
  getMethodologyCardById,
} from "@/lib/methodology/ip-copywriting-cards"

export interface CopyMethodologyPlan {
  businessGoal: MethodologyBusinessGoal
  contentRoute: MethodologyContentRoute
  cardIds: string[]
  localOptimize?: MethodologyLocalOptimize
  /** 显式点名的结构模型（如 LOGO/AIDA）；有则结构模块以该模型为准 */
  structureModel?: "logo_aida"
  structureModules: string[]
  confidence: number
  source: "explicit" | "keyword" | "task_spec" | "inferred"
  assumptions: string[]
}

const GOAL_KEYWORD_GROUPS: Array<{
  goal: MethodologyBusinessGoal
  patterns: RegExp[]
  weight: number
}> = [
  {
    goal: "lead",
    patterns: [
      /获客|线索|留资|私信|预约|诊断|咨询|陪跑|高客单|筛选客户|精准客户|招商/,
    ],
    weight: 10,
  },
  {
    goal: "convert",
    patterns: [/成交|转化|报名|购买|下单|付费|课程售卖|产品说明|活动报名/],
    weight: 9,
  },
  {
    goal: "traffic",
    patterns: [/流量|起号|破圈|曝光|涨粉|播放量|引流|刷到|停留/],
    weight: 8,
  },
  {
    goal: "trust",
    patterns: [/人设|信任|来时路|价值观|踩坑|专业经历|为什么找我/],
    weight: 8,
  },
  {
    goal: "brand",
    patterns: [/品牌|品宣|品牌曝光|品牌声量/],
    weight: 7,
  },
]

const ROUTE_KEYWORD_GROUPS: Array<{
  route: MethodologyContentRoute
  patterns: RegExp[]
}> = [
  {
    route: "persona_trust",
    patterns: [/人设信任|来时路|价值观|踩坑故事|为什么可以信任/],
  },
  {
    route: "point_of_view",
    patterns: [/观点|立场|误区|反常识|趋势判断|争议|我认为/],
  },
  {
    route: "case_convert",
    patterns: [/案例转化|客户故事|前后对比|成交故事|学员案例/],
  },
  {
    route: "problem_solve",
    patterns: [/问题解决|痛点|避坑|方法|答疑|干货|怎么做|如何/],
  },
]

const LOCAL_KEYWORD_GROUPS: Array<{
  local: MethodologyLocalOptimize
  patterns: RegExp[]
  cardId: string
}> = [
  { local: "hook", patterns: [/开头|前3秒|第一句话|钩子|起手|开场/], cardId: "local.hook" },
  { local: "title", patterns: [/标题|封面标题|发布标题/], cardId: "local.title" },
  { local: "ending", patterns: [/结尾|收尾|评论引导|行动引导|CTA/], cardId: "local.ending" },
  { local: "structure", patterns: [/结构|节奏|中段|展开|逻辑|太散/], cardId: "local.structure" },
  { local: "oral", patterns: [/去AI味|口语化|像人说话|太书面|太端着|人味/], cardId: "local.oral" },
]

/** 漏斗模型 = LOGO/AIDA 宽进窄出；用户显式点名时优先生效 */
const LOGO_AIDA_PATTERN =
  /漏斗\s*模型|logo\s*模型|LOGO\s*模型|AIDA\s*模型?|\bA\.?I\.?D\.?A\b|注意[→\-—]?兴趣[→\-—]?欲望[→\-—]?行动|宽进窄出|用AIDA|按AIDA|漏斗结构/

const LOGO_AIDA_CARD_ID = "structure.logo_aida"

function detectLogoAidaModel(text: string): boolean {
  return LOGO_AIDA_PATTERN.test(text)
}

const GOAL_TO_BUSINESS_CARD: Record<Exclude<MethodologyBusinessGoal, "unclear">, string> = {
  traffic: "card.traffic",
  lead: "card.lead_gen",
  trust: "card.trust",
  convert: "card.convert",
  brand: "card.traffic",
}

const GOAL_TO_DEFAULT_ROUTE: Record<Exclude<MethodologyBusinessGoal, "unclear">, MethodologyContentRoute> = {
  traffic: "point_of_view",
  lead: "problem_solve",
  trust: "persona_trust",
  convert: "case_convert",
  brand: "point_of_view",
}

const ROUTE_TO_CARD: Record<MethodologyContentRoute, string> = {
  persona_trust: "route.persona_trust",
  point_of_view: "route.point_of_view",
  problem_solve: "route.problem_solve",
  case_convert: "route.case_convert",
}

function scoreGoalFromText(text: string): {
  goal: MethodologyBusinessGoal
  score: number
  matched: boolean
} {
  let best: { goal: MethodologyBusinessGoal; score: number } = {
    goal: "unclear",
    score: 0,
  }
  for (const group of GOAL_KEYWORD_GROUPS) {
    if (group.patterns.some((re) => re.test(text))) {
      if (group.weight > best.score) {
        best = { goal: group.goal, score: group.weight }
      }
    }
  }
  return { goal: best.goal, score: best.score, matched: best.score > 0 }
}

function scoreRouteFromText(text: string): MethodologyContentRoute | null {
  for (const group of ROUTE_KEYWORD_GROUPS) {
    if (group.patterns.some((re) => re.test(text))) return group.route
  }
  return null
}

function detectLocalOptimize(text: string): { local?: MethodologyLocalOptimize; cardId?: string } {
  for (const group of LOCAL_KEYWORD_GROUPS) {
    if (group.patterns.some((re) => re.test(text))) {
      return { local: group.local, cardId: group.cardId }
    }
  }
  return {}
}

function goalFromTaskSpec(taskSpec?: TaskSpec | null): {
  goal: MethodologyBusinessGoal | null
  sourceBits: string[]
} {
  if (!taskSpec) return { goal: null, sourceBits: [] }
  const bits: string[] = []
  const blob = [
    taskSpec.desiredAction,
    taskSpec.contentTask,
    taskSpec.useScenario,
    taskSpec.goal,
    taskSpec.ctaText,
  ]
    .filter(Boolean)
    .join(" ")

  if (!blob.trim()) return { goal: null, sourceBits: [] }

  const scored = scoreGoalFromText(blob)
  if (scored.matched) {
    bits.push(`TaskSpec字段命中目标词→${scored.goal}`)
    return { goal: scored.goal, sourceBits: bits }
  }

  const action = String(taskSpec.desiredAction || "").toLowerCase()
  if (/私信|留资|预约|诊断|咨询|加微信|扫码/.test(action)) {
    bits.push("desiredAction偏线索承接→lead")
    return { goal: "lead", sourceBits: bits }
  }
  if (/购买|报名|下单|成交|付费/.test(action)) {
    bits.push("desiredAction偏成交→convert")
    return { goal: "convert", sourceBits: bits }
  }
  if (/关注|点赞|评论|转发|收藏/.test(action)) {
    bits.push("desiredAction偏互动曝光→traffic")
    return { goal: "traffic", sourceBits: bits }
  }

  return { goal: null, sourceBits: [] }
}

function uniquePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function mergeStructureModules(cardIds: string[]): string[] {
  const modules: string[] = []
  const seen = new Set<string>()
  for (const id of cardIds) {
    const card = getMethodologyCardById(id)
    if (!card) continue
    for (const mod of card.structureModules) {
      if (seen.has(mod)) continue
      seen.add(mod)
      modules.push(mod)
    }
  }
  return modules
}

export interface ResolveCopyMethodologyPlanInput {
  rawInput: string
  taskSpec?: TaskSpec | null
  runtimeTask?: string | null
  topicType?: string | null
  /** chat 场景允许目标模糊时不强制推断为 lead */
  mode?: "generate" | "chat"
}

/**
 * 解析本轮方法论计划。优先级：显式词 → TaskSpec → light_edit 局部卡 → 推断默认。
 * 若点名 LOGO/AIDA 模型，强制注入 structure.logo_aida，并以该结构模块为准。
 */
export function resolveCopyMethodologyPlan(
  input: ResolveCopyMethodologyPlanInput,
): CopyMethodologyPlan {
  const raw = String(input.rawInput || "")
  const assumptions: string[] = []
  const isLightEdit = input.runtimeTask === "light_edit"
  const wantsLogoAida = detectLogoAidaModel(raw)

  const localHit = detectLocalOptimize(raw)
  const explicitGoal = scoreGoalFromText(raw)
  const taskGoal = goalFromTaskSpec(input.taskSpec)
  const routeFromText = scoreRouteFromText(raw)

  let businessGoal: MethodologyBusinessGoal = "unclear"
  let source: CopyMethodologyPlan["source"] = "inferred"
  let confidence = 0.35

  if (explicitGoal.matched) {
    businessGoal = explicitGoal.goal
    source = "explicit"
    confidence = 0.9
  } else if (taskGoal.goal) {
    businessGoal = taskGoal.goal
    source = "task_spec"
    confidence = 0.75
  } else if (localHit.local && isLightEdit) {
    businessGoal = "unclear"
    source = "keyword"
    confidence = 0.7
  } else if (/引流|曝光|起号/.test(raw)) {
    businessGoal = "traffic"
    source = "keyword"
    confidence = 0.7
  } else if (wantsLogoAida) {
    // 只点名结构模型、未说业务目标：默认按线索获客承接（结尾落到业务）
    businessGoal = "lead"
    source = "explicit"
    confidence = 0.85
    assumptions.push("已点名漏斗/LOGO/AIDA模型；业务目标未另写明，默认按线索获客收束到业务CTA")
  } else {
    // generate：老板 IP 默认偏获客；chat 可保持 unclear 供追问
    if (input.mode === "chat") {
      businessGoal = "unclear"
      source = "inferred"
      confidence = 0.3
      assumptions.push("对话目标未明，可追问一题确认（获客/转化/人设信任/品牌曝光）")
    } else {
      businessGoal = "lead"
      source = "inferred"
      confidence = 0.45
      assumptions.push("未检出明确目标词，按老板IP默认推断为线索获客(lead)")
    }
  }

  if (taskGoal.sourceBits.length) {
    assumptions.push(...taskGoal.sourceBits)
  }

  const contentRoute: MethodologyContentRoute =
    routeFromText ||
    (businessGoal !== "unclear"
      ? GOAL_TO_DEFAULT_ROUTE[businessGoal]
      : "problem_solve")

  if (!routeFromText && businessGoal !== "unclear") {
    assumptions.push(`内容路由按目标默认：${contentRoute}`)
  }

  const cardIds: string[] = []

  if (isLightEdit && localHit.cardId && !wantsLogoAida) {
    cardIds.push(localHit.cardId)
    // light_edit：不换整卡业务目标，只带局部卡；若有明确 goal 再附一张业务卡作约束
    if (businessGoal !== "unclear") {
      cardIds.push(GOAL_TO_BUSINESS_CARD[businessGoal])
    }
  } else {
    if (businessGoal !== "unclear") {
      cardIds.push(GOAL_TO_BUSINESS_CARD[businessGoal])
    } else if (input.mode !== "chat") {
      cardIds.push("card.lead_gen")
    }
    cardIds.push(ROUTE_TO_CARD[contentRoute])
    if (localHit.cardId && !isLightEdit && !wantsLogoAida) {
      cardIds.push(localHit.cardId)
    }
    // 口播/去AI味时附带人味工具箱；开头优化附带七大开头
    if (localHit.local === "oral") cardIds.push("toolbox.humanizer")
    if (localHit.local === "hook") cardIds.push("toolbox.hooks7")
  }

  if (wantsLogoAida) {
    cardIds.unshift(LOGO_AIDA_CARD_ID)
    assumptions.push("结构模型=漏斗（AIDA宽进窄出）：开头泛话题，结尾落到自己业务")
    if (isLightEdit || /改|重写|按.*结构|用.*模型/.test(raw)) {
      assumptions.push("本轮按漏斗/AIDA结构改写，保留原选题与事实")
    }
    source = source === "inferred" ? "explicit" : source
    confidence = Math.max(confidence, 0.9)
  }

  // 同 goal 最多 2 业务卡 + 1 路由 + 可选结构/局部（注册表已按 id 去重）
  const limited = uniquePreserveOrder(cardIds).slice(0, 5)

  const logoCard = wantsLogoAida ? getMethodologyCardById(LOGO_AIDA_CARD_ID) : undefined
  const structureModules = logoCard?.structureModules?.length
    ? logoCard.structureModules
    : mergeStructureModules(limited)

  return {
    businessGoal,
    contentRoute,
    cardIds: limited,
    localOptimize: wantsLogoAida ? "structure" : localHit.local,
    structureModel: wantsLogoAida ? "logo_aida" : undefined,
    structureModules,
    confidence,
    source,
    assumptions,
  }
}

/** 将 plan 格式化为 prompt 中的「本轮方法论计划」块 */
export function formatMethodologyPlanForPrompt(plan: CopyMethodologyPlan): string {
  const lines = [
    `【本轮方法论计划】goal=${plan.businessGoal} route=${plan.contentRoute} cards=[${plan.cardIds.join(", ")}] confidence=${plan.confidence.toFixed(2)} source=${plan.source}`,
    plan.structureModel === "logo_aida"
      ? "结构模型：漏斗模型（AIDA宽进窄出）——开头泛话题，结尾落到自己业务；禁止跳段"
      : "",
    plan.localOptimize ? `局部优化点：${plan.localOptimize}` : "",
    plan.structureModules.length
      ? `【结构模块（按序写满，禁止跳模块）】${plan.structureModules.join(" → ")}`
      : "",
    plan.assumptions.length ? `目标判定假设：${plan.assumptions.join("；")}` : "",
    "规则：只允许使用已选卡片；禁止调用未注入卡片的句式库；知识库决定「写谁」，卡片决定「怎么写」；成稿正文禁止方法论说明书腔。",
  ]
  return lines.filter(Boolean).join("\n")
}

/** chat 场景：目标不清时返回追问文案（1 题 + 选项） */
export function buildMethodologyGoalClarifyQuestion(plan: CopyMethodologyPlan): string | null {
  if (plan.businessGoal !== "unclear" || plan.confidence >= 0.6) return null
  return [
    "这条内容更想达成哪个目标？",
    "A. 获客线索（留资/私信/预约诊断）",
    "B. 成交转化（报名/购买）",
    "C. 人设信任（来时路/专业可信）",
    "D. 品牌曝光（起号/流量/品宣）",
  ].join("\n")
}
