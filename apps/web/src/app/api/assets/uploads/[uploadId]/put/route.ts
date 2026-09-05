import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { uploadBufferToOss } from "@/lib/oss"
import {
  loadCompletableReservation,
  UploadReservationError,
} from "@/lib/oss/upload-reservation"
import { enforceUploadSizeLimit } from "@/lib/internal-beta-limits"

// api-inventory: upload-limit=internal-beta

// ─── POST /api/assets/uploads/[uploadId]/put ─────────
// 同源代理上传：浏览器直传 OSS 被跨域拦截（本地开发桶未配置 CORS 等）时的兜底通道。
// 校验与 complete 完全同源（归属/pending/未过期），写入后客户端照常调 complete 登记。

export const POST = withUserAuth(async (request, { user, params }) => {
  const uploadId = params?.uploadId
  if (!uploadId || typeof uploadId !== "string") {
    return NextResponse.json({ error: "uploadId required" }, { status: 400 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 })
  }
  const uploadLimitResponse = enforceUploadSizeLimit([file])
  if (uploadLimitResponse) return uploadLimitResponse

  try {
    const reservation = await loadCompletableReservation(uploadId, user.id)
    if (file.size !== reservation.declaredSizeBytes) {
      return NextResponse.json(
        { error: "文件大小与上传预约不符" },
        { status: 400 },
      )
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadBufferToOss(reservation.objectKey, buffer, file.type || reservation.contentType)
    return NextResponse.json({ data: { ok: true } }, { status: 200 })
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
