import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { getBrandingConfig } from "@/lib/branding"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  cloneFastAvatar,
  cloneProfessionalAvatar,
  cloneImageAvatar,
} from "@/lib/shanjian"
import { generateSignedUrl, generateVideoThumbnailUrl, signOssUrls } from "@/lib/oss"
import {
  AssetReadabilityError,
  resolveUpstreamReadableUrl,
} from "@/lib/upstream-media"
import { enforceCountBetaLimit } from "@/lib/internal-beta-limits"

// ─── POST /api/avatars ─────────────────────────────────

export const POST = withUserAuth(async (request, { user }) => {
  const requestId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${requestId}] Avatar creation initiated by user ${user.id}`)

  const { name, cloneType, videoUrl, imageUrl } =
    await parseJsonRecord(request)

  console.log(`[${requestId}] Request params: name=${name}, cloneType=${cloneType}, videoUrl=${!!videoUrl}, imageUrl=${!!imageUrl}`)

  if (!name || !cloneType) {
    console.warn(`[${requestId}] Validation failed: missing name or cloneType`)
    return NextResponse.json(
      { error: "name and cloneType are required" },
      { status: 400 }
    )
  }

  const validCloneTypes = ["fast", "professional", "image"]
  if (!validCloneTypes.includes(cloneType)) {
    console.warn(`[${requestId}] Validation failed: invalid cloneType=${cloneType}`)
    return NextResponse.json(
      { error: "cloneType must be one of: fast, professional, image" },
      { status: 400 }
    )
  }

  // Validate required fields per type
  if (cloneType === "fast" && !videoUrl) {
    console.warn(`[${requestId}] Validation failed: fast clone requires videoUrl`)
    return NextResponse.json(
      { error: "videoUrl is required for fast clone" },
      { status: 400 }
    )
  }
  if (cloneType === "professional" && !videoUrl) {
    console.warn(`[${requestId}] Validation failed: professional clone requires videoUrl`)
    return NextResponse.json(
      { error: "videoUrl is required for professional clone" },
      { status: 400 }
    )
  }
  if (cloneType === "image" && !imageUrl) {
    console.warn(`[${requestId}] Validation failed: image clone requires imageUrl`)
    return NextResponse.json(
      { error: "imageUrl is required for image clone" },
      { status: 400 }
    )
  }

  const limitResponse = await enforceCountBetaLimit({ userId: user.id, kind: "avatar" })
  if (limitResponse) return limitResponse

  // Read authVideoUrl from the user record (recorded once, reused for all avatar creations)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { authVideoUrl: true },
  })

  const authVideoUrl = dbUser?.authVideoUrl
  const branding = await getBrandingConfig()
  const authText = branding.name

  if (!authVideoUrl) {
    console.warn(`[${requestId}] User ${user.id} missing authVideoUrl`)
    return NextResponse.json(
      { error: "请先录制授权视频。在创建数字人前，需要先录制一段包含特定文字的授权视频以验证身份。" },
      { status: 400 }
    )
  }

  console.log(`[${requestId}] Resolved authVideoUrl, proceeding with URL signing`)

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
    console.log(`[${requestId}] URL signing successful`)
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

  // Create Avatar record
  const avatar = await prisma.avatar.create({
    data: {
      userId: user.id,
      name,
      status: "cloning",
      sourceVideoUrl: videoUrl || imageUrl,
    },
  })

  console.log(`[${requestId}] Avatar record created: ${avatar.id}, submitting to Shanjian`)

  try {
    let taskId: string

    if (cloneType === "fast") {
      taskId = await cloneFastAvatar({
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

    console.log(`[${requestId}] Shanjian API call successful, taskId: ${taskId}`)

    // Store externalTaskId on avatar
    const updatedAvatar = await prisma.avatar.update({
      where: { id: avatar.id },
      data: { externalTaskId: taskId },
    })

    console.log(`[${requestId}] Avatar ${avatar.id} created successfully with externalTaskId ${taskId}`)
    return NextResponse.json({ data: updatedAvatar }, { status: 201 })
  } catch (error) {
    console.error(`[${requestId}] Shanjian API call failed for avatar ${avatar.id}:`, error)
    console.error(`[${requestId}] Error details: ${error instanceof Error ? error.message : String(error)}`)

    // If Shanjian call fails, mark avatar as failed
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

    console.log(`[${requestId}] Avatar ${avatar.id} marked as failed in database`)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
})

// ─── GET /api/avatars ──────────────────────────────────

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10)

  const where: { userId: string; status?: string } = { userId: user.id }
  if (status) where.status = status

  const [results, total] = await Promise.all([
    prisma.avatar.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.avatar.count({ where }),
  ])

  // Add computed preview/thumbnail/cover fields, then sign all OSS URLs
  const resultsWithPreview = results.map((avatar) => {
    const videoSrc = avatar.demoVideoUrl || avatar.sourceVideoUrl;
    // Fallback: generate cover from video thumbnail when DB coverUrl is null
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
