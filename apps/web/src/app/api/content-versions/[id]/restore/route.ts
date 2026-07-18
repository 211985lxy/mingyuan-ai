import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const maxDuration = 30

export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少版本 id" }, { status: 400 })

  const target = await prisma.aimContentVersion.findFirst({ where: { id, userId: user.id } })
  if (!target) return NextResponse.json({ error: "版本不存在" }, { status: 404 })

  const version = await prisma.$transaction(async (tx) => {
    const latest = target.generationId
      ? await lockLatest(tx, user.id, target.generationId, null, target.format)
      : await lockLatest(tx, user.id, null, target.conversationId, target.format)
    return tx.aimContentVersion.create({
      data: {
        userId: user.id,
        generationId: target.generationId,
        conversationId: target.conversationId,
        format: target.format,
        content: target.content,
        source: "manual_edit",
        versionNo: (latest?.versionNo ?? 0) + 1,
        parentVersionId: target.id,
      },
    })
  })
  return NextResponse.json({ data: version })
})

async function lockLatest(
  tx: Prisma.TransactionClient,
  userId: string,
  generationId: string | null,
  conversationId: string | null,
  format: string,
) {
  const rows = generationId
    ? await tx.$queryRaw<Array<{ versionNo: number }>>`
        SELECT versionNo FROM AimContentVersion
        WHERE userId = ${userId} AND generationId = ${generationId} AND format = ${format}
        ORDER BY versionNo DESC LIMIT 1 FOR UPDATE`
    : await tx.$queryRaw<Array<{ versionNo: number }>>`
        SELECT versionNo FROM AimContentVersion
        WHERE userId = ${userId} AND conversationId = ${conversationId} AND format = ${format}
        ORDER BY versionNo DESC LIMIT 1 FOR UPDATE`
  return rows[0]
}
