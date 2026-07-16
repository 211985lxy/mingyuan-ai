import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  parseScriptPolishBody,
  runScriptPolish,
} from "@/lib/aim/services/script-polish"

export const maxDuration = 60

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonRecord(request)
  const result = await runScriptPolish(user.id, parseScriptPolishBody(body))
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ data: result.data })
})
