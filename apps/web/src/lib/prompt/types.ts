/**
 * Prompt Registry 类型定义（Step① 主线）。
 *
 * 约束：
 * - key 命名 `<domain>.<capability>.<variant>`，全局只在 PROMPT_KEYS 定义，
 *   调用点禁止写字面量。
 * - 内容统一 string：原数组形态 prompt 用 `.join("\n")` 存储，保证与现状逐字一致。
 * - 选版规则是**纯函数**（selectVersion），便于单测且不依赖 DB。
 */

/** prompt 注入位置：system=系统提示词；function=函数/工具说明；inline=片段。 */
export type PromptType = "system" | "function" | "inline"

/** 版本状态：draft 不自动生效；qualified 通过评测；active 线上生效。 */
export type PromptStatus = "draft" | "qualified" | "active"

/** prompt 正文。统一 string（数组形态已 join）。 */
export type PromptContent = string

/** 批0 六个 key。新增 prompt 必须先在此登记。 */
export const PROMPT_KEYS = {
  knowledgeEntityExtract: "knowledge.entity_extract.default",
  marketingShortvideo: "marketing.analysis.shortvideo",
  commentRadar: "comment.insight.radar",
  transcriptPolish: "marketing.analysis.transcript_polish",
  competitorAnalysis: "competitor.analysis.default",
  meetingInsight: "aim.meeting.insight_extract.default",
} as const

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS]

/** 内置兜底 seed（与源码同仓，v1 = 迁移前的逐字原文）。 */
export interface PromptSeed {
  key: string
  domain: string
  description?: string
  /** 内置固定为 1。 */
  version: number
  type: PromptType
  content: PromptContent
  fixtureKey?: string
}

/** 对外返回的 prompt 记录（来源可能是 DB，也可能是内置 seed）。 */
export interface PromptRecord {
  key: string
  version: number
  content: PromptContent
  type: PromptType
  status: PromptStatus
  /** true 表示来自内置 seed（DB 不可用/未命中时的兜底），便于观测。 */
  fromSeed: boolean
}

export interface GetOptions {
  /** 显式指定版本号；优先级最高。 */
  version?: number
  /** 限定状态（单值或数组）；不传则按 active > qualified > draft。 */
  status?: PromptStatus | PromptStatus[]
}

/** 状态优先级：高 → 低。 */
export const STATUS_PRIORITY: readonly PromptStatus[] = ["active", "qualified", "draft"] as const

const KNOWN_TYPES: readonly PromptType[] = ["system", "function", "inline"] as const

/** 未知 type 一律收敛为 system（批0 全为 system）。 */
export function normalizeType(value: string): PromptType {
  return (KNOWN_TYPES as readonly string[]).includes(value) ? (value as PromptType) : "system"
}

/** 未知 status 一律收敛为 draft（最保守，不会自动生效）。 */
export function normalizeStatus(value: string): PromptStatus {
  return value === "active" || value === "qualified" ? value : "draft"
}

/** 同状态内取版本号最大的一条。 */
function maxVersion(list: PromptRecord[]): PromptRecord {
  return list.reduce((acc, cur) => (cur.version > acc.version ? cur : acc))
}

/**
 * 选版纯函数（优先级：显式 version > active > qualified > draft）。
 * @param versions - 该 key 下所有候选版本（可为空）
 * @param opts - 选版条件
 * @returns 命中的记录；无命中返回 null（调用方回落 seed）
 */
export function selectVersion(
  versions: readonly PromptRecord[],
  opts?: GetOptions,
): PromptRecord | null {
  if (!versions || versions.length === 0) return null
  const list: PromptRecord[] = [...versions]

  if (typeof opts?.version === "number") {
    const exact = list.filter((v) => v.version === opts.version)
    if (exact.length === 0) return null
    // 同一 version 若存在多状态行，仍按状态优先级收敛
    return pickByStatusPriority(exact)
  }

  if (opts?.status) {
    const wanted: PromptStatus[] = Array.isArray(opts.status) ? opts.status : [opts.status]
    const filtered = list.filter((v) => wanted.includes(v.status))
    if (filtered.length === 0) return null
    return pickByStatusPriority(filtered)
  }

  return pickByStatusPriority(list)
}

/** 按 active > qualified > draft 取；未知状态按 draft 处理；同状态取最大版本。 */
function pickByStatusPriority(list: PromptRecord[]): PromptRecord {
  for (const status of STATUS_PRIORITY) {
    const candidates = list.filter((v) => v.status === status)
    if (candidates.length > 0) return maxVersion(candidates)
  }
  // 全部是未知状态（已 normalize 不会发生），退化为取最大版本
  return maxVersion(list)
}

/** seed → 记录（status 固定 draft，fromSeed=true）。 */
export function seedToRecord(seed: PromptSeed): PromptRecord {
  return {
    key: seed.key,
    version: seed.version,
    content: seed.content,
    type: seed.type,
    status: "draft",
    fromSeed: true,
  }
}
