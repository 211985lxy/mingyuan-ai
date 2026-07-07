import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { audioToText } from "@/lib/shanjian"

// ─── POST /api/effects/asr ─────────────────────────────

export const POST = withUserAuth(async (request) => {
  const { audioUrl, language } = await request.json()

  if (!audioUrl || !language) {
    return NextResponse.json(
      { error: "audioUrl and language are required" },
      { status: 400 }
    )
  }

  const taskId = await audioToText({
    audioUrl,
    language,
  })

  return NextResponse.json({ data: { taskId } }, { status: 201 })
})
