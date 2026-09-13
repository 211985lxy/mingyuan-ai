import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { buildAuthUserPayload } from "@/lib/auth-user"
import {
  getDigitalHumanAuthorizationText,
  getDigitalHumanProvider,
  hasExactDigitalHumanAuthorizationText,
  DigitalHumanProviderError,
} from "@/lib/digital-human-provider"
import {
  assertCompletedReservationForManagedUrl,
  isManagedOssUrl,
  UploadReservationError,
} from "@/lib/oss"

function authorizationTextResponse() {
  const provider = getDigitalHumanProvider()
  try {
    return NextResponse.json({
      provider,
      authorizationText: getDigitalHumanAuthorizationText(provider),
    })
  } catch (error) {
    if (error instanceof DigitalHumanProviderError && error.code === "AUTH_TEXT_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: error.message, code: error.code, provider },
        { status: 503 },
      )
    }
    throw error
  }
}

/** 返回当前供应商要求逐字朗读的授权原文。 */
export const GET = withUserAuth(async () => authorizationTextResponse())

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonRecord(request)
  const authVideoUrl = body.authVideoUrl
  const providedText = body.authText ?? body.authorizationText
  const uploadId = typeof body.uploadId === "string" ? body.uploadId : null
  const provider = getDigitalHumanProvider()

  if (typeof authVideoUrl !== "string" || !authVideoUrl.trim()) {
    return NextResponse.json(
      { error: "authVideoUrl is required" },
      { status: 400 },
    )
  }

  let authorizationText: string
  try {
    authorizationText = getDigitalHumanAuthorizationText(provider)
  } catch (error) {
    if (error instanceof DigitalHumanProviderError && error.code === "AUTH_TEXT_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: error.message, code: error.code, provider },
        { status: 503 },
      )
    }
    throw error
  }

  if (!hasExactDigitalHumanAuthorizationText(providedText, provider)) {
    return NextResponse.json(
      {
        error: "授权视频必须按页面显示的原文逐字朗读",
        code: "AUTH_TEXT_MISMATCH",
        authorizationText,
      },
      { status: 422 },
    )
  }

  // 授权视频必须来自 AIM 自有对象存储，并且对应已完成的上传预约。
  // 不接受外部 URL，避免供应商读取临时链接或不可追溯的个人文件。
  if (!isManagedOssUrl(authVideoUrl)) {
    return NextResponse.json(
      {
        error: "授权视频必须先上传到 AIM 存储",
        code: "AUTH_VIDEO_STORAGE_REQUIRED",
      },
      { status: 422 },
    )
  }
  try {
    await assertCompletedReservationForManagedUrl({
      userId: user.id,
      assetUrl: authVideoUrl,
      uploadId,
    })
  } catch (error) {
    if (error instanceof UploadReservationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }
    throw error
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      authVideoUrl: true,
      authVideoText: true,
      authVideoConfirmedAt: true,
      createdAt: true,
      expiresAt: true,
    },
    data: {
      authVideoUrl: authVideoUrl.trim(),
      authVideoText: authorizationText,
      authVideoConfirmedAt: new Date(),
    },
  })

  return NextResponse.json({
    user: {
      ...buildAuthUserPayload(updatedUser),
      authVideoUrl: updatedUser.authVideoUrl,
      authVideoText: updatedUser.authVideoText,
      authVideoConfirmedAt: updatedUser.authVideoConfirmedAt?.toISOString() ?? null,
    },
    provider,
    authorizationText,
  })
})
