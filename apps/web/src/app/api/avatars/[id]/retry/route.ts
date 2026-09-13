import { NextResponse } from "next/server"
import { resolveAuthorizedAuthText } from "@/lib/digital-human-auth-video"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { withUserAuth } from "@/lib/user-auth"
import {
  cloneFastAvatarForProvider,
  cloneImageAvatarForProvider,
  normalizeDigitalHumanProvider,
} from "@/lib/digital-human-provider"
import {
  AssetReadabilityError,
  resolveUpstreamReadableUrl,
} from "@/lib/upstream-media"
import { isManagedOssUrl } from "@/lib/oss"
import { acquireProviderSlot, releaseProviderSlot } from "@/lib/digital-human-semaphore"

// ─── POST /api/avatars/[id]/retry ─────────────────────
// Re-submit a failed avatar to its recorded provider using the original source material.

export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const avatar = await prisma.avatar.findFirst({ where: { id, userId: user.id } })

  if (!avatar) {
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

  if (!avatar.projectId) {
    return NextResponse.json(
      { error: "该数字人尚未归属客户项目，请重新创建", code: "PROJECT_REQUIRED" },
      { status: 422 },
    )
  }

  const project = await prisma.clientProject.findFirst({
    where: { id: avatar.projectId, userId: user.id, status: "active" },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json(
      { error: "客户项目不存在或已归档", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    )
  }

  const provider = normalizeDigitalHumanProvider(avatar.provider)

  const requestId = `avatar-retry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${requestId}] Avatar retry initiated for ${avatar.id} by user ${user.id}`)

  // Determine clone type from the source material
  const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(avatar.sourceVideoUrl)
  const cloneType = isImage ? "image" : "fast"

  // Resolve auth video（姓名与授权文案一同取出：文案按声明人实例化）
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      authVideoUrl: true,
      authVideoText: true,
      authVideoConfirmedAt: true,
    },
  })

  const authVideoUrl = dbUser?.authVideoUrl
  const resolvedAuth = resolveAuthorizedAuthText(provider, dbUser?.name ?? null)
  if (!resolvedAuth.ok) {
    return NextResponse.json(
      { error: resolvedAuth.message, code: resolvedAuth.code, provider },
      { status: resolvedAuth.status },
    )
  }
  const authText = resolvedAuth.authText

  if (!authVideoUrl || !dbUser?.authVideoConfirmedAt || dbUser.authVideoText !== authText) {
    return NextResponse.json(
      {
        error: "请先按页面显示的授权原文录制并确认授权视频",
        code: "AUTH_VIDEO_CONFIRMATION_REQUIRED",
        authorizationText: authText,
      },
      { status: 400 },
    )
  }
  if (!isManagedOssUrl(authVideoUrl)) {
    return NextResponse.json(
      { error: "授权视频必须先上传到 AIM 存储", code: "AUTH_VIDEO_STORAGE_REQUIRED" },
      { status: 422 },
    )
  }

  if (provider === "chanjing" && isImage) {
    return NextResponse.json(
      { error: "蝉镜当前仅支持极速视频克隆，请重新上传本人训练视频", code: "UNSUPPORTED_CLONE_TYPE" },
      { status: 422 },
    )
  }

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

  const acquired = await acquireProviderSlot(provider)
  if (!acquired) {
    return NextResponse.json(
      { error: "数字人服务当前任务较多，请稍后重试", code: "PROVIDER_BUSY", provider },
      { status: 429 },
    )
  }

  // Reset avatar status to cloning only after reserving the provider slot.
  try {
    await prisma.avatar.update({
      where: { id: avatar.id, userId: user.id },
      data: {
        status: "cloning",
        errorCode: null,
        errorMessage: null,
        externalTaskId: null,
      },
    })
  } catch (error) {
    await releaseProviderSlot(provider)
    throw error
  }

  console.log(`[${requestId}] Avatar ${avatar.id} reset to cloning, submitting to digital-human provider`)

  try {
    let taskId: string

    if (cloneType === "image") {
      taskId = await cloneImageAvatarForProvider(provider, {
        imageUrl: signedSourceUrl,
        authVideoUrl: signedAuthVideoUrl,
        authText,
      })
    } else {
      taskId = await cloneFastAvatarForProvider(provider, {
        name: avatar.name,
        videoUrl: signedSourceUrl,
        authVideoUrl: signedAuthVideoUrl,
        authText,
      })
    }

    console.log(`[${requestId}] Provider retry successful, taskId: ${taskId}`)

    const updatedAvatar = await prisma.avatar.update({
      where: { id: avatar.id, userId: user.id },
      data: { externalTaskId: taskId },
    })

    return NextResponse.json({ data: updatedAvatar })
  } catch (error) {
    console.error(`[${requestId}] Provider retry failed for avatar ${avatar.id}:`, error)

    const errorCode = error instanceof Error && "code" in error ? (error as { code: string }).code : null
    const errorMessage = error instanceof Error
      ? error.message
      : "重试失败，请稍后再试"

    await prisma.avatar.update({
      where: { id: avatar.id, userId: user.id },
      data: { status: "failed", errorCode, errorMessage },
    })
    await releaseProviderSlot(provider)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
})
