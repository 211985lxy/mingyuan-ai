import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth-session"
import { withUserAuth } from "@/lib/user-auth"

export const POST = withUserAuth(async () => {
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response, "user")
  return response
}, { requireActivation: false })
