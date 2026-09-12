import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { retryVideoTaskTransfer, VideoTaskTransferRetryError } from "@/lib/video-task-settlement"
import { signOssUrls } from "@/lib/oss"

/** 仅重试成片转存，不会重新调用蝉镜或闪剪。 */
export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  try {
    const task = await retryVideoTaskTransfer({ taskId: id, userId: user.id })
    return NextResponse.json({ data: task ? signOssUrls(task) : null })
  } catch (error) {
    if (error instanceof VideoTaskTransferRetryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
