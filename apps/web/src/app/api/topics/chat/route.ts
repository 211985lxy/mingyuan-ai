import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"

import { handleTopicChatMessage } from "@/lib/topic-chat-service"
import { withUserAuth } from "@/lib/user-auth"
import { topicChatBodySchema } from "@/features/topics/contracts/api"

export const maxDuration = 60

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, topicChatBodySchema, { maxBytes: 16 * 1024 })
  const projectId = typeof body.projectId === "string" ? body.projectId : ""
  const content = typeof body.content === "string" ? body.content.trim() : ""

  if (!projectId) {
    return NextResponse.json({ error: "projectId 不能为空" }, { status: 400 })
  }
  if (content.length < 2) {
    return NextResponse.json({ error: "先说一句具体想法" }, { status: 400 })
  }

  try {
    const result = await handleTopicChatMessage({
      userId: user.id,
      projectId,
      content,
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "选题生成失败" },
      { status: 500 },
    )
  }
})
