import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"

export const maxDuration = 30

/**
 * POST /api/content-versions/[id]/restore
 * 回滚：读取目标版本内容，以它为 parent 创建一个新版本（source=manual_edit）。
 * 历史版本绝不修改或删除。
 */
export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少版本 id" }, { status: 400 })
  }

  const target = await prisma.aimContentVersion.findFirst({
    where: { id, userId: user.id },
  })
  if (!target) {
    return NextResponse.json({ error: "版本不存在" }, { status: 404 })
  }

  // 在同一 generationId / conversationId 维度下取最大 versionNo
  const latest = await prisma.aimContentVersion.findFirst({
    where: {
      userId: user.id,
      ...(target.generationId
        ? { generationId: target.generationId }
        : { conversationId: target.conversationId }),
    },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  })

  const version = await prisma.aimContentVersion.create({
    data: {
      userId: user.id,
      generationId: target.generationId,
      conversationId: target.conversationId,
      format: target.format,
      content: target.content,
      source: "manual_edit",
      versionNo: (latest?.versionNo ?? 0) + 1,
      parentVersionId: target.id,
    },
  })

  return NextResponse.json({
    data: {
      id: version.id,
      generationId: version.generationId,
      conversationId: version.conversationId,
      format: version.format,
      versionNo: version.versionNo,
      source: version.source,
      parentVersionId: version.parentVersionId,
      createdAt: version.createdAt,
      content: version.content, // 回滚需要把全文回填编辑器
    },
  })
})
