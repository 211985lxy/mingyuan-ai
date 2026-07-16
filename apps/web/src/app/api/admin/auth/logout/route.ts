import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth-session"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const POST = withAdminAuth(async (_request, { admin }) => {
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { sessionVersion: { increment: 1 } },
  })
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response, "admin")
  return response
})
