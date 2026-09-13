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

function authorizationTextResponse(name: string | null) {
  const provider = getDigitalHumanProvider()
  try {
    return NextResponse.json({
      provider,
      authorizationText: getDigitalHumanAuthorizationText(provider, name),
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

/** 返回当前供应商要求逐字朗读的授权原文（按当前登录用户姓名实例化）。 */
export const GET = withUserAuth(async (_request, { user }) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true },
  })
  return authorizationTextResponse(dbUser?.name ?? null)
})

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

  // 授权原文按声明人姓名实例化，姓名是校验的一部分而非装饰
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true },
  })
  const declaredName = dbUser?.name ?? null

  let authorizationText: string
  try {
    authorizationText = getDigitalHumanAuthorizationText(provider, declaredName)
  } catch (error) {
    if (error instanceof DigitalHumanProviderError) {
      if (error.code === "AUTH_TEXT_NOT_CONFIGURED") {
        return NextResponse.json(
          { error: error.message, code: error.code, provider },
          { status: 503 },
        )
      }
      if (error.code === "AUTH_NAME_REQUIRED") {
        return NextResponse.json(
          { error: error.message, code: error.code, provider },
          { status: 422 },
        )
      }
    }
    throw error
  }

  if (!hasExactDigitalHumanAuthorizationText(providedText, provider, declaredName)) {
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
