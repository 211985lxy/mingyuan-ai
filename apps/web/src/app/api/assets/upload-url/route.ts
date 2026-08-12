import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import {
  createAssetUploadReservation,
  UploadReservationError,
} from "@/lib/oss/upload-reservation"

// ─── POST /api/assets/upload-url ───────────────────────
// 返回 OSS PostObject 表单字段（不再签发无界 PUT URL）

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonRecord(request)
  const { fileName, contentType, assetType } = body
  const sizeBytes = body.sizeBytes

  if (sizeBytes === undefined || sizeBytes === null || sizeBytes === "") {
    return NextResponse.json(
      {
        error: "客户端过期：请刷新页面后重试（需上报 sizeBytes）",
        code: "UPLOAD_CLIENT_REFRESH_REQUIRED",
      },
      { status: 400 },
    )
  }

  if (!fileName || !contentType || !assetType) {
    return NextResponse.json(
      { error: "fileName, contentType, assetType are required" },
      { status: 400 },
    )
  }

  try {
    const result = await createAssetUploadReservation({
      userId: user.id,
      fileName: String(fileName),
      contentType: String(contentType),
      sizeBytes: Number(sizeBytes),
      assetType: String(assetType),
    })
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof UploadReservationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }
    throw error
  }
})
