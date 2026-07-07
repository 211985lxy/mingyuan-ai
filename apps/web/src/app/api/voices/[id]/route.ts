import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { deleteAsset } from "@/lib/shanjian"

// ─── DELETE /api/voices/[id] ───────────────────────────

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const asset = await prisma.asset.findUnique({ where: { id } })

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (asset.userId !== user.id || asset.assetType !== "voice") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Fire-and-forget: delete external speaker
  if (asset.externalSpeakerId) {
    deleteAsset(asset.externalSpeakerId).catch(() => {})
  }

  await prisma.asset.delete({ where: { id } })

  return NextResponse.json({ data: { deleted: true } })
})
