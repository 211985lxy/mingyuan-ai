import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import {
  createWatchVideoExtraction,
  serializeWatchVideoExtraction,
} from "@/lib/competitor-watch-video-extractions"
import { withUserAuth } from "@/lib/user-auth"
import { watchVideoExtractBodySchema } from "@/features/competitor/contracts/api"

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, watchVideoExtractBodySchema, { maxBytes: 8 * 1024 })

  const watchAccountId = typeof body.watchAccountId === "string" ? body.watchAccountId : ""
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : ""
  if (!watchAccountId) {
    return NextResponse.json({ error: "请选择账号" }, { status: 400 })
  }
  if (!videoUrl) {
    return NextResponse.json({ error: "缺少视频链接" }, { status: 400 })
  }

  try {
    const record = await createWatchVideoExtraction({
      userId: user.id,
      watchAccountId,
      videoUrl,
    })
    return NextResponse.json(serializeWatchVideoExtraction(record), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建文案提取任务失败"
    const status = message.includes("无权限") || message.includes("不存在") ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
})
