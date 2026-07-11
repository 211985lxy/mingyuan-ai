import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export const dynamic = "force-dynamic"

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

/** 将任意输入归一为「显式数字 | null」，未填写/null/空串一律 null，绝不 0。 */
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

export function sanitizeOutcomeBody(body: Record<string, unknown>): SanitizedOutcome {
  if (typeof body.collectWindowDay !== "number" || ![7, 14, 30].includes(body.collectWindowDay)) {
    throw new Error("collectWindowDay 必须是 7/14/30")
  }
  const collectWindowDay = body.collectWindowDay
  return {
    collectWindowDay,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const owned = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: { id: true, topicSelectionId: true, projectId: true },
    })
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 })

    const outcomes = await prisma.contentOutcome.findMany({
      where: { generationId: id, userId: user.id },
      orderBy: { collectWindowDay: "asc" },
    })
    return NextResponse.json({
      outcomes,
      topicSelectionId: owned.topicSelectionId,
      projectId: owned.projectId,
    })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const owned = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: { id: true, topicSelectionId: true, projectId: true },
    })
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 })

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 })
    }

    let sanitized: SanitizedOutcome
    try {
      sanitized = sanitizeOutcomeBody(body)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }

    // upsert 靠 unique([userId, generationId, collectWindowDay]) 去重
    const outcome = await prisma.contentOutcome.upsert({
      where: {
        userId_generationId_collectWindowDay: {
          userId: user.id,
          generationId: id,
          collectWindowDay: sanitized.collectWindowDay,
        },
      },
      create: {
        userId: user.id,
        generationId: id,
        topicSelectionId: owned.topicSelectionId,
        projectId: owned.projectId,
        ...sanitized,
      },
      update: { ...sanitized },
    })
    return NextResponse.json({ outcome })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
