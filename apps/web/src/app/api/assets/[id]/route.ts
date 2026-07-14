import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

// ─── DELETE /api/assets/[id] ───────────────────────────

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const asset = await prisma.asset.findFirst({ where: { id, userId: user.id } })

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.asset.delete({ where: { id, userId: user.id } })

  return NextResponse.json({ data: { deleted: true } })
})
