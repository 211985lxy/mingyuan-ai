import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { generateUploadUrl } from "@/lib/oss"

// ─── POST /api/assets/upload-url ───────────────────────

export const POST = withUserAuth(async (request) => {
  const { fileName, contentType } = await parseJsonRecord(request)

  if (!fileName || !contentType) {
    return NextResponse.json(
      { error: "fileName and contentType are required" },
      { status: 400 }
    )
  }

  const result = await generateUploadUrl(fileName, contentType)

  if (!result) {
    return NextResponse.json(
      { error: "OSS storage is not configured" },
      { status: 503 }
    )
  }

  return NextResponse.json({ data: result })
})
