import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import {
  createVideoCopyExtraction,
  serializeVideoCopyExtraction,
} from "@/lib/video-copy-extractions"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"

export const GET = withUserAuth(async (_request, { user }) => {
  const records = await prisma.videoCopyExtraction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return NextResponse.json({ items: records.map(serializeVideoCopyExtraction) })
})

export const POST = withUserAuth(async (request, { user }) => {
  const quotaResponse = await enforceDailyBetaLimit(user.id, "video_copy_extraction")
  if (quotaResponse) return quotaResponse

  let body: { url?: unknown }
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 })
  }

  const url = typeof body.url === "string" ? body.url : ""

  try {
    const record = await createVideoCopyExtraction(user.id, url)
    return NextResponse.json(serializeVideoCopyExtraction(record), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "请输入正确的视频链接"
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
