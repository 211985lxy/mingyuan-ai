import { parseJsonRecord } from "@/lib/api-contract"
import { env } from "@/env"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { textToSpeech } from "@/lib/shanjian"
import { synthesizeVolcengineSpeech } from "@/lib/volcengine-tts"

// ─── POST /api/effects/tts ─────────────────────────────

export const POST = withUserAuth(async (request) => {
  const { text, speakerId, language, speedRatio, volume, codec } =
    await parseJsonRecord(request)

  if (!text) {
    return NextResponse.json(
      { error: "text is required" },
      { status: 400 }
    )
  }

  if (env.VOLC_SPEECH_API_KEY) {
    const audio = await synthesizeVolcengineSpeech({
      text,
      speaker: speakerId,
      speedRatio,
      volume,
    })
    return NextResponse.json({ data: { provider: "volcengine", ...audio } }, { status: 201 })
  }

  if (!speakerId) {
    return NextResponse.json(
      { error: "speakerId is required" },
      { status: 400 }
    )
  }

  const taskId = await textToSpeech({
    text,
    speakerId,
    ...(language && { language }),
    ...(speedRatio !== undefined && { speedRatio }),
    ...(volume !== undefined && { volume }),
    ...(codec && { codec }),
  })

  return NextResponse.json({ data: { taskId } }, { status: 201 })
})
