import { NextResponse } from "next/server"
import { getBrandingConfig } from "@/lib/branding"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { withUserAuth } from "@/lib/user-auth"
import {
  cloneFastAvatar,
  cloneImageAvatar,
} from "@/lib/shanjian"
import {
  AssetReadabilityError,
  resolveUpstreamReadableUrl,
} from "@/lib/upstream-media"

// ─── POST /api/avatars/[id]/retry ─────────────────────
// Re-submit a failed avatar to Shanjian using the original source material.

export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const avatar = await prisma.avatar.findUnique({ where: { id } })

  if (!avatar || avatar.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (avatar.status !== "failed") {
    return NextResponse.json(
      { error: "只有失败的数字人才能重试" },
      { status: 422 },
    )
  }

  // Idempotent lock: prevent duplicate retries within 120s (no finally delete — let TTL expire)
  const lockKey = `avatar:retry:${avatar.id}`
  const locked = await redis.set(lockKey, "1", "EX", 120, "NX")
  if (!locked) {
    return NextResponse.json(
      { error: "您的重试请求正在处理中，请勿重复操作" },
      { status: 409 },
    )
  }

  if (!avatar.sourceVideoUrl) {
    return NextResponse.json(
      { error: "原始素材不存在，请重新创建数字人" },
      { status: 422 },
    )
  }

  const requestId = `avatar-retry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${requestId}] Avatar retry initiated for ${avatar.id} by user ${user.id}`)

  // Determine clone type from the source material
  const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(avatar.sourceVideoUrl)
  const cloneType = isImage ? "image" : "fast"

  // Resolve auth video
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { authVideoUrl: true },
  })

  const authVideoUrl = dbUser?.authVideoUrl
  if (!authVideoUrl) {
    return NextResponse.json(
      { error: "请先录制授权视频" },
      { status: 400 },
    )
  }

  const branding = await getBrandingConfig()
  const authText = branding.name

  let signedSourceUrl: string
  let signedAuthVideoUrl: string

  try {
    signedSourceUrl = resolveUpstreamReadableUrl(avatar.sourceVideoUrl, "sourceVideoUrl")
    signedAuthVideoUrl = resolveUpstreamReadableUrl(authVideoUrl, "authVideoUrl")
  } catch (error) {
    console.error(`[${requestId}] URL resolution failed:`, error)
    if (error instanceof AssetReadabilityError) {
      return NextResponse.json(
        { error: error.message, code: error.code, field: error.field },
        { status: 422 },
      )
    }
    throw error
  }

  // Reset avatar status to cloning
  await prisma.avatar.update({
    where: { id: avatar.id },
    data: {
      status: "cloning",
      errorCode: null,
      errorMessage: null,
      externalTaskId: null,
    },
  })

  console.log(`[${requestId}] Avatar ${avatar.id} reset to cloning, submitting to Shanjian`)

  try {
    let taskId: string

    if (cloneType === "image") {
      taskId = await cloneImageAvatar({
        imageUrl: signedSourceUrl,
        authVideoUrl: signedAuthVideoUrl,
        authText,
      })
    } else {
      taskId = await cloneFastAvatar({
        videoUrl: signedSourceUrl,
        authVideoUrl: signedAuthVideoUrl,
        authText,
      })
    }

    console.log(`[${requestId}] Shanjian retry successful, taskId: ${taskId}`)

    const updatedAvatar = await prisma.avatar.update({
      where: { id: avatar.id },
      data: { externalTaskId: taskId },
    })

    return NextResponse.json({ data: updatedAvatar })
  } catch (error) {
    console.error(`[${requestId}] Shanjian retry failed for avatar ${avatar.id}:`, error)

    const errorCode = error instanceof Error && "code" in error ? (error as { code: string }).code : null
    const errorMessage = error instanceof Error
      ? error.message
      : "重试失败，请稍后再试"

    await prisma.avatar.update({
      where: { id: avatar.id },
      data: { status: "failed", errorCode, errorMessage },
    })

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
})
