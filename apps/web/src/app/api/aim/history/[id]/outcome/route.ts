import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { sanitizeOutcomeBody, type SanitizedOutcome } from "@/lib/content-outcome"

export const dynamic = "force-dynamic"

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
