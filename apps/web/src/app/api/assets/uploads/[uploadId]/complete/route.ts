import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { generateSignedUrl, isManagedOssUrl } from "@/lib/oss"
import {
  completeAssetUploadReservation,
  UploadReservationError,
} from "@/lib/oss/upload-reservation"

// ─── POST /api/assets/uploads/[uploadId]/complete ───────

export const POST = withUserAuth(async (request, { user, params }) => {
  const uploadId = params?.uploadId
  if (!uploadId || typeof uploadId !== "string") {
    return NextResponse.json({ error: "uploadId required" }, { status: 400 })
  }

  let name: string | undefined
  try {
    const body = await parseJsonRecord(request)
    if (typeof body.name === "string") name = body.name
  } catch {
    // body 可选
  }

  try {
    const asset = await completeAssetUploadReservation({
      uploadId,
      userId: user.id,
      name,
    })
    // 私有桶：裸 URL 浏览器/模型都拉取不到，附带长期签名读 URL 供聊天预览与多模态输入
    const readUrl = isManagedOssUrl(asset.url)
      ? generateSignedUrl(asset.url, 7 * 24 * 3600)
      : asset.url
    return NextResponse.json({ data: { ...asset, readUrl } }, { status: 201 })
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
