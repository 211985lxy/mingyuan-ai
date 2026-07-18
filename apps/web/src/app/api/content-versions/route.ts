import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"

export const maxDuration = 30

// 版本来源（与设计方案 P0 对齐）：generated 原始生成 | manual_edit 手动改 |
// ai_polish AI润色 | ai_proofread AI校对 | ai_imitate AI仿写
const VALID_SOURCES = new Set([
  "generated",
  "manual_edit",
  "ai_polish",
  "ai_proofread",
  "ai_imitate",
])

const PREVIEW_LENGTH = 100

/**
 * GET /api/content-versions?generationId=xxx | ?conversationId=xxx
 * 按 versionNo 升序返回版本列表（不含 content 全文，只带长度与前 100 字预览）。
 */
export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const generationId = searchParams.get("generationId")
  const conversationId = searchParams.get("conversationId")

  // 单版本查询：diff / 预览全文用
  if (id) {
    const version = await prisma.aimContentVersion.findFirst({
      where: { id, userId: user.id },
    })
    if (!version) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 })
    }
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
        content: version.content,
      },
    })
  }

  if (!generationId && !conversationId) {
    return NextResponse.json(
      { error: "缺少 generationId 或 conversationId" },
      { status: 400 }
    )
  }

  const versions = await prisma.aimContentVersion.findMany({
    where: {
      userId: user.id,
      ...(generationId ? { generationId } : { conversationId }),
    },
    orderBy: { versionNo: "asc" },
  })

  return NextResponse.json({
    data: versions.map((version) => ({
      id: version.id,
      generationId: version.generationId,
      conversationId: version.conversationId,
      format: version.format,
      versionNo: version.versionNo,
      source: version.source,
      parentVersionId: version.parentVersionId,
      createdAt: version.createdAt,
      contentLength: version.content.length,
      preview: version.content.slice(0, PREVIEW_LENGTH),
    })),
  })
})

/**
 * POST /api/content-versions
 * body: { generationId?, conversationId?, format, content, source }
 * versionNo = 同一 generationId（或 conversationId）下当前最大 versionNo + 1，
 * parentVersionId 自动指向上一版。只追加不覆盖（immutable）。
 */
export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json()
  const generationId =
    typeof body.generationId === "string" && body.generationId ? body.generationId : null
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null
  const format = typeof body.format === "string" ? body.format.trim() : ""
  const content = typeof body.content === "string" ? body.content : ""
  const source = typeof body.source === "string" ? body.source : ""

  if (!generationId && !conversationId) {
    return NextResponse.json(
      { error: "缺少 generationId 或 conversationId" },
      { status: 400 }
    )
  }
  if (!format) {
    return NextResponse.json({ error: "format 不能为空" }, { status: 400 })
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "content 不能为空" }, { status: 400 })
  }
  if (!VALID_SOURCES.has(source)) {
    return NextResponse.json({ error: "source 不合法" }, { status: 400 })
  }

  // 取当前维度下最大 versionNo，新版本 +1；parent 指向上一版
  const latest = await prisma.aimContentVersion.findFirst({
    where: {
      userId: user.id,
      ...(generationId ? { generationId } : { conversationId }),
    },
    orderBy: { versionNo: "desc" },
    select: { id: true, versionNo: true },
  })

  const version = await prisma.aimContentVersion.create({
    data: {
      userId: user.id,
      generationId,
      conversationId,
      format,
      content,
      source,
      versionNo: (latest?.versionNo ?? 0) + 1,
      parentVersionId: latest?.id ?? null,
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
      contentLength: version.content.length,
      preview: version.content.slice(0, PREVIEW_LENGTH),
    },
  })
})
