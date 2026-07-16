import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 })
  }

  const account = await prisma.watchAccount.findFirst({ where: { id, userId: user.id } })
  if (!account) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 })
  }
  await prisma.watchAccount.delete({ where: { id, userId: user.id } })
  return NextResponse.json({ success: true })
})
