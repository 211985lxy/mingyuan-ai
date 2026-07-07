import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { getPublicAvatarPreviewById } from "@/lib/public-avatar-preview-cache"

export const GET = withUserAuth(async (_request, { params }) => {
  const previewId = params?.taskId
  if (!previewId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 })
  }

  try {
    const preview = await getPublicAvatarPreviewById(previewId)
    if (!preview) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 })
    }

    return NextResponse.json({
      data: preview,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "试看结果查询失败，请稍后重试"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
