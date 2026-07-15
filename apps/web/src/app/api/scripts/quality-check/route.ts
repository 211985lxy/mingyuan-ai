import { NextRequest, NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import {
  parseScriptQualityCheckInput,
  runScriptQualityCheck,
} from "@/lib/aim/services/script-quality-check"

/**
 * POST /api/scripts/quality-check
 * 四维质量门控 API
 */
export const POST = withUserAuth(async (request: NextRequest) => {
  try {
    const body = await request.json()
    const parsed = parseScriptQualityCheckInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    return NextResponse.json(await runScriptQualityCheck(parsed.value))
  } catch (error) {
    console.error("[quality-check] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "质量检测失败" },
      { status: 500 }
    )
  }
})
