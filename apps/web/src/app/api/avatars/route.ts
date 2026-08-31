import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  cloneFastAvatar,
  cloneProfessionalAvatar,
  cloneImageAvatar,
  getDigitalHumanAuthorizationText,
  getDigitalHumanProvider,
  DigitalHumanProviderError,
} from "@/lib/digital-human-provider"
import { generateSignedUrl, generateVideoThumbnailUrl, isManagedOssUrl, signOssUrls } from "@/lib/oss"
import {
  AssetReadabilityError,
  resolveUpstreamReadableUrl,
} from "@/lib/upstream-media"
import { enforceCountBetaLimit } from "@/lib/internal-beta-limits"
import { acquireProviderSlot, releaseProviderSlot } from "@/lib/digital-human-semaphore"

export const POST = withUserAuth(async (request, { user }) => {
  const requestId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const { name, cloneType, videoUrl, imageUrl, projectId } =
    await parseJsonRecord(request)
  if (!name || !cloneType || typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json(
      { error: "name, cloneType and projectId are required" },
      { status: 400 }
    )
  }

  const project = await prisma.clientProject.findFirst({
    where: { id: projectId.trim(), userId: user.id, status: "active" },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json(
      { error: "客户项目不存在或已归档", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    )
  }
  const validCloneTypes = ["fast", "professional", "image"]
  if (!validCloneTypes.includes(cloneType)) {
    return NextResponse.json(
      { error: "cloneType must be one of: fast, professional, image" },
      { status: 400 }
    )
  }

  if (cloneType === "fast" && !videoUrl) {
    return NextResponse.json({ error: "videoUrl is required for fast clone" }, { status: 400 })
  }
  if (cloneType === "professional" && !videoUrl) {
    return NextResponse.json({ error: "videoUrl is required for professional clone" }, { status: 400 })
  }
  if (cloneType === "image" && !imageUrl) {
    return NextResponse.json({ error: "imageUrl is required for image clone" }, { status: 400 })
  }
  const provider = getDigitalHumanProvider()
  let authText: string
  try {
    authText = getDigitalHumanAuthorizationText(provider)
  } catch (error) {
    if (error instanceof DigitalHumanProviderError && error.code === "AUTH_TEXT_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: error.message, code: error.code, provider },
        { status: 503 },
      )
    }
    throw error
  }
  if (provider === "chanjing" && cloneType !== "fast") {
    return NextResponse.json(
      { error: "蝉镜当前仅支持极速视频克隆，请上传本人训练视频", code: "UNSUPPORTED_CLONE_TYPE" },
      { status: 422 },
    )
  }
  const limitResponse = await enforceCountBetaLimit({ userId: user.id, kind: "avatar" })
  if (limitResponse) return limitResponse

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      authVideoUrl: true,
      authVideoText: true,
      authVideoConfirmedAt: true,
    },
  })
  const authVideoUrl = dbUser?.authVideoUrl
  if (!authVideoUrl || !dbUser?.authVideoConfirmedAt || dbUser.authVideoText !== authText) {
    return NextResponse.json(
      {
        error: "请先按页面显示的授权原文录制并确认授权视频",
        code: "AUTH_VIDEO_CONFIRMATION_REQUIRED",
        authorizationText: authText,
      },
      { status: 400 }
    )
  }
  if (!isManagedOssUrl(authVideoUrl)) {
    return NextResponse.json(
      { error: "授权视频必须先上传到 AIM 存储", code: "AUTH_VIDEO_STORAGE_REQUIRED" },
      { status: 422 },
    )
  }
  let signedVideoUrl: string | undefined
  let signedAuthVideoUrl: string
  let signedImageUrl: string | undefined

  try {
    signedVideoUrl = videoUrl
      ? resolveUpstreamReadableUrl(videoUrl, "videoUrl")
      : undefined
    signedAuthVideoUrl = resolveUpstreamReadableUrl(
      authVideoUrl,
      "authVideoUrl",
    )
    signedImageUrl = imageUrl
      ? resolveUpstreamReadableUrl(imageUrl, "imageUrl")
      : undefined
  } catch (error) {
    console.error(`[${requestId}] URL resolution failed:`, error)
    if (error instanceof AssetReadabilityError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          field: error.field,
        },
        { status: 422 }
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

  let avatar
  try {
    avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        projectId: project.id,
        name: String(name).trim(),
        status: "cloning",
        provider,
        authorizationText: authText,
        authorizationConfirmedAt: dbUser.authVideoConfirmedAt,
        sourceVideoUrl: videoUrl || imageUrl,
      },
    })
  } catch (error) {
    await releaseProviderSlot(provider)
    throw error
  }
  try {
    let taskId: string

    if (cloneType === "fast") {
      taskId = await cloneFastAvatar({
        name,
        videoUrl: signedVideoUrl!,
        authVideoUrl: signedAuthVideoUrl!,
        authText,
      })
    } else if (cloneType === "professional") {
      taskId = await cloneProfessionalAvatar({
        videoUrl: signedVideoUrl!,
        authVideoUrl: signedAuthVideoUrl!,
        authText,
      })
    } else {
      taskId = await cloneImageAvatar({
        imageUrl: signedImageUrl!,
        authVideoUrl: signedAuthVideoUrl!,
        authText,
      })
    }

    const updatedAvatar = await prisma.avatar.update({
      where: { id: avatar.id },
      data: { externalTaskId: taskId },
    })

    return NextResponse.json({ data: updatedAvatar }, { status: 201 })
  } catch (error) {
    const errorCode = error instanceof Error && "code" in error ? (error as { code: string }).code : null
    const errorMessage = error instanceof Error ? error.message : "克隆任务提交失败，请检查视频质量后重试"
    await prisma.avatar.update({
      where: { id: avatar.id },
      data: {
        status: "failed",
        errorCode,
        errorMessage,
      },
    })
    await releaseProviderSlot(provider)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
})
export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const projectId = searchParams.get("projectId")
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10)
  if (projectId) {
    const project = await prisma.clientProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json(
        { error: "客户项目不存在", code: "PROJECT_NOT_FOUND" },
        { status: 404 },
      )
    }
  }
  const where: { userId: string; status?: string; projectId?: string } = { userId: user.id }
  if (status) where.status = status
  if (projectId) where.projectId = projectId
  const [results, total] = await Promise.all([
    prisma.avatar.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.avatar.count({ where }),
  ])
  const resultsWithPreview = results.map((avatar) => {
    const videoSrc = avatar.demoVideoUrl || avatar.sourceVideoUrl;
    const coverUrl = avatar.coverUrl
      || (videoSrc ? generateVideoThumbnailUrl(videoSrc) : null);
    return signOssUrls({
      ...avatar,
      coverUrl,
      previewUrl: videoSrc ? generateSignedUrl(videoSrc) : null,
      thumbnailUrl: videoSrc ? generateVideoThumbnailUrl(videoSrc) : null,
    });
  })

  return NextResponse.json({ data: { results: resultsWithPreview, total, page, pageSize } })
})
