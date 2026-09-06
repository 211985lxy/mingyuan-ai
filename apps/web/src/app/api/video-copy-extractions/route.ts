import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import {
  createVideoCopyExtraction,
  serializeVideoCopyExtraction,
} from "@/lib/video-copy-extractions"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const GET = withUserAuth(async (request, { user }) => {
  const url = new URL(request.url)
  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId: url.searchParams.get("projectId"),
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  const records = await prisma.videoCopyExtraction.findMany({
    where: { userId: user.id, projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return NextResponse.json({ items: records.map(serializeVideoCopyExtraction) })
})

export const POST = withUserAuth(async (request, { user }) => {
  const quotaResponse = await enforceDailyBetaLimit(user.id, "video_copy_extraction")
  if (quotaResponse) return quotaResponse

  let body: { url?: unknown; projectId?: unknown }
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 })
  }

  const url = typeof body.url === "string" ? body.url : ""
  const requestedProjectId = typeof body.projectId === "string" && body.projectId ? body.projectId.trim() : undefined

  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId,
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  try {
    const record = await createVideoCopyExtraction(user.id, url, projectId)
    return NextResponse.json(serializeVideoCopyExtraction(record), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "请输入正确的视频链接"
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
