import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const DELETE = withUserAuth(async (request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 })
  }

  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  // id + userId + projectId 条件删除：属于其他项目（或空项目）的记录一律视为不存在。
  const result = await prisma.watchAccount.deleteMany({
    where: { id, userId: user.id, projectId },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
})
