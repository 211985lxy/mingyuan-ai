import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import type { Prisma, AimContentVersion } from "@/generated/prisma/client"

export const maxDuration = 30

const VALID_SOURCES = new Set([
  "generated",
  "manual_edit",
  "ai_polish",
  "ai_proofread",
  "ai_imitate",
])
const MAX_RETRIES = 3

function summary(version: AimContentVersion) {
  return {
    id: version.id,
    generationId: version.generationId,
    conversationId: version.conversationId,
    format: version.format,
    versionNo: version.versionNo,
    source: version.source,
    parentVersionId: version.parentVersionId,
    createdAt: version.createdAt,
    contentLength: version.content.length,
    preview: version.content.slice(0, 100),
  }
}

export const GET = withUserAuth(async (request, { user }) => {
  const search = new URL(request.url).searchParams
  const id = search.get("id")
  const generationId = search.get("generationId")
  const conversationId = search.get("conversationId")
  const format = search.get("format")

  if (id) {
    const version = await prisma.aimContentVersion.findFirst({
      where: { id, userId: user.id },
    })
    if (!version) return NextResponse.json({ error: "版本不存在" }, { status: 404 })
    return NextResponse.json({ data: { ...summary(version), content: version.content } })
  }
  if (!generationId && !conversationId) {
    return NextResponse.json({ error: "缺少 generationId 或 conversationId" }, { status: 400 })
  }

  const versions = await prisma.aimContentVersion.findMany({
    where: { userId: user.id, ...(generationId ? { generationId } : { conversationId }), ...(format ? { format } : {}) },
    orderBy: { versionNo: "asc" },
  })
  return NextResponse.json({ data: versions.map(summary) })
})

export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json()
  const generationId = typeof body.generationId === "string" && body.generationId ? body.generationId : null
  const conversationId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null
  const format = typeof body.format === "string" ? body.format.trim() : ""
  const content = typeof body.content === "string" ? body.content : ""
  const source = typeof body.source === "string" ? body.source : ""

  if (!generationId && !conversationId) return NextResponse.json({ error: "缺少 generationId 或 conversationId" }, { status: 400 })
  if (!format) return NextResponse.json({ error: "format 不能为空" }, { status: 400 })
  if (!content.trim()) return NextResponse.json({ error: "content 不能为空" }, { status: 400 })
  if (!VALID_SOURCES.has(source)) return NextResponse.json({ error: "source 不合法" }, { status: 400 })

  let version!: AimContentVersion
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      version = await prisma.$transaction((tx) => createNextVersion(tx, {
        userId: user.id,
        generationId,
        conversationId,
        format,
        content,
        source,
      }))
      break
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 50))
    }
  }
  return NextResponse.json({ data: summary(version) })
})

async function createNextVersion(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    generationId: string | null
    conversationId: string | null
    format: string
    content: string
    source: string
  },
): Promise<AimContentVersion> {
  const rows = input.generationId
    ? await tx.$queryRaw<Array<{ id: string; versionNo: number; content: string; source: string }>>`
        SELECT id, versionNo, content, source FROM AimContentVersion
        WHERE userId = ${input.userId} AND generationId = ${input.generationId} AND format = ${input.format}
        ORDER BY versionNo DESC LIMIT 1 FOR UPDATE`
    : await tx.$queryRaw<Array<{ id: string; versionNo: number; content: string; source: string }>>`
        SELECT id, versionNo, content, source FROM AimContentVersion
        WHERE userId = ${input.userId} AND conversationId = ${input.conversationId} AND format = ${input.format}
        ORDER BY versionNo DESC LIMIT 1 FOR UPDATE`
  const latest = rows[0]
  if (latest && latest.content === input.content && latest.source === input.source) return tx.aimContentVersion.findUniqueOrThrow({ where: { id: latest.id } })
  return tx.aimContentVersion.create({
    data: {
      userId: input.userId,
      generationId: input.generationId,
      conversationId: input.conversationId,
      format: input.format,
      content: input.content,
      source: input.source,
      versionNo: (latest?.versionNo ?? 0) + 1,
      parentVersionId: latest?.id ?? null,
    },
  })
}
