import { Prisma } from "@/generated/prisma/client"

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
  userVerdict: string | null
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
    userVerdict: typeof body.userVerdict === "string" ? body.userVerdict.slice(0, 1000) : null,
  }
}
