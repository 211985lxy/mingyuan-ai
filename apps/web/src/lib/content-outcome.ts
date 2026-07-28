import { Prisma } from "@/generated/prisma/client"
import {
  parseOutcomeVerdictCode,
  type OutcomeVerdictCode,
} from "@/lib/aim/outcome-verdict"

type NullableInt = number | null
type NullableDecimal = Prisma.Decimal | null

export interface SanitizedOutcome {
  collectWindowDay: number
  platform: string | null
  publishedAt: Date | null
  qualifiedCommentCount: NullableInt
  dmCount: NullableInt
  qualifiedLeadCount: NullableInt
  appointmentCount: NullableInt
  dealCount: NullableInt
  revenue: NullableDecimal
  views: NullableInt
  likes: NullableInt
  comments: NullableInt
  saves: NullableInt
  shares: NullableInt
  audienceFeedback: string | null
  /** 自由文本备注，不参与优秀/失败判定 */
  userVerdict: string | null
  verdictCode: OutcomeVerdictCode | null
}

function toNullableInt(value: unknown): NullableInt {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.trunc(Number(value))
  return null
}

function toNullableDecimal(value: unknown): NullableDecimal {
  if (typeof value === "number" && Number.isFinite(value)) return new Prisma.Decimal(value)
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return new Prisma.Decimal(value)
  return null
}

/** Normalize explicit numeric inputs while keeping omitted values distinct from zero. */
/**
 * @description sanitizeoutcomebody
 * @param body - 请求体
 * @returns SanitizedOutcome
 */
export function sanitizeOutcomeBody(body: Record<string, unknown>): SanitizedOutcome {
  if (typeof body.collectWindowDay !== "number" || ![7, 14, 30].includes(body.collectWindowDay)) {
    throw new Error("collectWindowDay 必须是 7/14/30")
  }
  return {
    collectWindowDay: body.collectWindowDay,
    platform: typeof body.platform === "string" && body.platform.trim() ? body.platform.trim().slice(0, 40) : null,
    publishedAt: typeof body.publishedAt === "string" && body.publishedAt ? new Date(body.publishedAt) : null,
    qualifiedCommentCount: toNullableInt(body.qualifiedCommentCount),
    dmCount: toNullableInt(body.dmCount),
    qualifiedLeadCount: toNullableInt(body.qualifiedLeadCount),
    appointmentCount: toNullableInt(body.appointmentCount),
    dealCount: toNullableInt(body.dealCount),
    revenue: toNullableDecimal(body.revenue),
    views: toNullableInt(body.views),
    likes: toNullableInt(body.likes),
    comments: toNullableInt(body.comments),
    saves: toNullableInt(body.saves),
    shares: toNullableInt(body.shares),
    audienceFeedback: typeof body.audienceFeedback === "string" ? body.audienceFeedback.slice(0, 5000) : null,
    userVerdict: typeof body.userVerdict === "string"
      ? body.userVerdict.slice(0, 1000)
      : typeof body.verdictNote === "string"
        ? body.verdictNote.slice(0, 1000)
        : null,
    verdictCode: parseOutcomeVerdictCode(body.verdictCode),
  }
}

/**
 * 允许被 PATCH（部分更新）的字段名。collectWindowDay 是主键的一部分，不在其中。
 * 思路：update 时只覆盖「请求体里明确出现过」的字段，避免重复提交部分数据时
 * 把之前已填的字段误清成 null。这与「未填写≠0」并不冲突——后者指单次请求内
 * 显式传空串/null 要存 null；此处针对的是多次保存之间的合并语义。
 */
const PATCHABLE_FIELDS = [
  "platform", "publishedAt",
  "qualifiedCommentCount", "dmCount", "qualifiedLeadCount", "appointmentCount",
  "dealCount", "revenue", "views", "likes", "comments", "saves", "shares",
  "audienceFeedback", "userVerdict", "verdictCode",
] as const

/**
 * 构造 upsert 的 update 片段：只包含请求体里明确出现过的字段。
 * - collectWindowDay 永远用 sanitized 值（它决定 upsert 定位哪一行）。
 * - 其余字段：请求体里有该 key 才写入（哪怕是 null）；没有则不触碰，保留旧值。
 */
/**
 * @description 构建outcomeupdate
 * @param sanitized - sanitized
 * @param presentKeys - present键列表
 * @returns Partial<SanitizedOutcome>
 */
export function buildOutcomeUpdate(
  sanitized: SanitizedOutcome,
  presentKeys: Set<string>,
): Partial<SanitizedOutcome> {
  const update: Record<string, unknown> = { collectWindowDay: sanitized.collectWindowDay }
  for (const field of PATCHABLE_FIELDS) {
    if (presentKeys.has(field)) {
      update[field] = sanitized[field]
    }
  }
  // verdictNote 是 userVerdict 的别名写入键
  if (presentKeys.has("verdictNote") && !presentKeys.has("userVerdict")) {
    update.userVerdict = sanitized.userVerdict
  }
  return update as Partial<SanitizedOutcome>
}
