import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import {
  createOrReusePublicAvatarPreview,
  getPublicAvatarPreviewDefaults,
} from "@/lib/public-avatar-preview-cache"

const MIN_TEXT_LENGTH = 6
const MAX_TEXT_LENGTH = 80

export const GET = withUserAuth(async (request, { user }) => {
  const virtualmanId = request.nextUrl.searchParams.get("virtualmanId")
  if (!virtualmanId) {
    return NextResponse.json({ error: "virtualmanId is required" }, { status: 400 })
  }

  try {
    const defaults = await getPublicAvatarPreviewDefaults({
      userId: user.id,
      virtualmanId,
    })
    return NextResponse.json({ data: defaults })
  } catch (error) {
    const message = error instanceof Error ? error.message : "预览默认设置读取失败，请稍后重试"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})

export const POST = withUserAuth(async (request, { user }) => {
  const { virtualmanId, speakerId, text } = await request.json()

  if (!virtualmanId || !speakerId || typeof text !== "string") {
    return NextResponse.json(
      { error: "virtualmanId, speakerId and text are required" },
      { status: 400 }
    )
  }

  const normalizedText = text.trim()
  if (normalizedText.length < MIN_TEXT_LENGTH || normalizedText.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `预览文案需控制在 ${MIN_TEXT_LENGTH}-${MAX_TEXT_LENGTH} 个字符之间` },
      { status: 400 }
    )
  }

  try {
    const preview = await createOrReusePublicAvatarPreview({
      userId: user.id,
      virtualmanId,
      speakerId,
      text: normalizedText,
    })
    return NextResponse.json({ data: preview }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "试看生成失败，请稍后重试"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
