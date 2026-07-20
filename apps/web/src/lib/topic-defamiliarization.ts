/**
 * 陌生化（Defamiliarization）—— 选题的含金量门槛。
 *
 * 方法论核心："没有陌生化的选题是没有含金量的"。
 * 陌生化分两层，每条选题至少要能说清这两层：
 *   1) 稀缺的陌生（内容稀缺性制造陌生感），6 选 1；
 *   2) 赋比兴（把熟悉讲成陌生的表达手法），3 选 1。
 *
 * 注意命名隔离：这里的 scarcity/emotion/beauty 等属于"稀缺性六类"，
 * 与 lib/topic-validation 里的 12 个营销元素（其中也有名为 scarcity/emotion 的元素）
 * 是同名异义的两套体系，使用时务必通过 defamiliarization 命名空间访问，不混用。
 */

// ─── 稀缺性六类（第一层）──────────────────────────────────────

export const VALID_SCARCITY_CODES = [
  "scenery", // 稀缺景观
  "emotion", // 稀缺情感
  "beauty", // 稀缺美好
  "info", // 稀缺信息资讯
  "curio", // 稀缺奇闻异事
  "event", // 稀缺事件
] as const

export type ScarcityCode = (typeof VALID_SCARCITY_CODES)[number]

export const SCARCITY_META: Record<
  ScarcityCode,
  { name: string; short: string; description: string }
> = {
  scenery: {
    name: "稀缺景观",
    short: "景观",
    description: "没见过的大海、特殊视觉效果、稀缺景色等可遇不可求的画面",
  },
  emotion: {
    name: "稀缺情感",
    short: "情感",
    description: "特别饱满、少见的情感体验",
  },
  beauty: {
    name: "稀缺美好",
    short: "美好",
    description: "极其稀有的美好品质、善意或瞬间",
  },
  info: {
    name: "稀缺信息资讯",
    short: "资讯",
    description: "财经博主式的、普通人拿不到的稀缺信息",
  },
  curio: {
    name: "稀缺奇闻异事",
    short: "奇闻",
    description: "说书号、电影号式的稀缺奇闻",
  },
  event: {
    name: "稀缺事件",
    short: "事件",
    description: "婆媳剑拔弩张、街头抓眼球、稀缺故事等冲突性事件",
  },
}

// ─── 赋比兴三法（第二层）──────────────────────────────────────

export const VALID_RHETORIC_CODES = [
  "fu", // 赋
  "bi", // 比
  "xing", // 兴
] as const

export type RhetoricCode = (typeof VALID_RHETORIC_CODES)[number]

export const RHETORIC_META: Record<
  RhetoricCode,
  { name: string; short: string; description: string }
> = {
  fu: {
    name: "赋",
    short: "赋",
    description: "平铺直叙、铺陈堆叠，演绎具体的细节之美",
  },
  bi: {
    name: "比",
    short: "比",
    description: "以彼物比此物，呈现两者的并置、对立与结合之美",
  },
  xing: {
    name: "兴",
    short: "兴",
    description: "先言他物以引起所咏之词，借过程激发联想与转化之美",
  },
}

// ─── 含金量阈值 ───────────────────────────────────────────────

export const NOVELTY_HIGH = 75 // ≥75 高含金量
export const NOVELTY_LOW = 60 // <60 含金量偏低（触发标红 + 修改建议）

/**
 * @description 根据含金量分数判断陌生化等级（高/中/低）
 * @param score - 含金量分数（0-100）
 * @returns 陌生化等级：high（≥75）、mid（60-74）、low（<60）
 */
export function noveltyLevel(score: number): "high" | "mid" | "low" {
  if (score >= NOVELTY_HIGH) return "high"
  if (score >= NOVELTY_LOW) return "mid"
  return "low"
}

// ─── 字段结构 ─────────────────────────────────────────────────

export interface Defamiliarization {
  /** 稀缺类型（6 选 1） */
  scarcityType?: ScarcityCode
  /** 赋比兴手法（3 选 1） */
  rhetoric?: RhetoricCode
  /** 含金量分 0-100，由 LLM 直接给出 */
  noveltyScore?: number
  /** 一句话"凭什么陌生"：这条选题靠什么制造陌生 */
  note?: string
  /** 后端归一化时生成的修改建议（含金量不足或缺字段时） */
  advice?: string
}

function clampScore(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

function isValidScarcity(code: unknown): code is ScarcityCode {
  return typeof code === "string" && (VALID_SCARCITY_CODES as readonly string[]).includes(code)
}

function isValidRhetoric(code: unknown): code is RhetoricCode {
  return typeof code === "string" && (VALID_RHETORIC_CODES as readonly string[]).includes(code)
}

/**
 * 归一化陌生化字段：非法 code 置空、noveltyScore clamp，
 * 并在缺字段或含金量偏低时生成具体的修改建议（软门槛，不影响 reviewVerdict）。
 */
/**
 * @description 标准化defamiliarization
 * @param raw - 原始数据
 * @returns Defamiliarization
 */
export function normalizeDefamiliarization(
  raw: Record<string, unknown> | Defamiliarization | undefined | null,
): Defamiliarization {
  if (!raw) return { advice: buildAdvice(undefined, undefined, undefined) }

  const scarcityType = isValidScarcity(raw.scarcityType) ? raw.scarcityType : undefined
  const rhetoric = isValidRhetoric(raw.rhetoric) ? raw.rhetoric : undefined
  const noveltyScore =
    typeof raw.noveltyScore === "number" || typeof raw.noveltyScore === "string"
      ? clampScore(raw.noveltyScore)
      : undefined
  const note =
    typeof raw.note === "string" && raw.note.trim().length > 0 ? raw.note.trim() : undefined

  return {
    scarcityType,
    rhetoric,
    noveltyScore,
    note,
    advice: buildAdvice(scarcityType, rhetoric, noveltyScore),
  }
}

function buildAdvice(
  scarcityType: ScarcityCode | undefined,
  rhetoric: RhetoricCode | undefined,
  noveltyScore: number | undefined,
): string | undefined {
  if (!scarcityType) {
    return "未识别稀缺类型，建议明确这条选题靠什么稀缺素材（景观/情感/美好/资讯/奇闻/事件）。"
  }
  if (!rhetoric) {
    return "未识别赋比兴手法，建议用比/兴把熟悉的内容讲陌生。"
  }
  if (typeof noveltyScore === "number" && noveltyScore < NOVELTY_LOW) {
    return "含金量偏低，试着找一个更可遇不可求的陌生素材或更新颖的表达手法。"
  }
  return undefined
}
