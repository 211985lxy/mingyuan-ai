import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import type { Prisma, AimContentVersion } from "@/generated/prisma/client"

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

// 版本号创建最大重试次数（缓解并发事务的锁等待 / 死锁）
const VERSION_CREATE_MAX_RETRIES = 3

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

  // 原子创建下一版本号：用 SELECT ... FOR UPDATE 锁住当前维度下的最新版本
  // 行（含间隙锁），再取 max(versionNo)+1 后写入，消除「读 max → 写 +1」
  // 之间的并发竞态（TOCTOU）。schema 层面未加 generationId/conversationId
  // 复合唯一约束（两维度语义混淆），故在应用层用行锁 + 事务兜底。
  // 见文件末尾 createNextContentVersion 的详细说明。
  // 明确赋值断言：循环内最后一次失败会 throw，故跳出循环后 version 必有值。
  let version!: AimContentVersion
  for (let attempt = 1; attempt <= VERSION_CREATE_MAX_RETRIES; attempt++) {
    try {
      version = await prisma.$transaction((tx) =>
        createNextContentVersion(tx, {
          userId: user.id,
          generationId,
          conversationId,
          format,
          content,
          source,
        }),
      )
      break
    } catch (e) {
      if (attempt === VERSION_CREATE_MAX_RETRIES) throw e
      // 短暂退避后重试，缓解锁等待 / 死锁
      await new Promise((r) => setTimeout(r, 50 * attempt))
    }
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
      contentLength: version.content.length,
      preview: version.content.slice(0, PREVIEW_LENGTH),
    },
  })
})

/**
 * 在事务内原子地创建下一版本号。
 *
 * 竞态背景：原实现是「findFirst 取 max(versionNo) → create(versionNo+1)」两步，
 * 中间无锁。两个并发 POST 可能读到相同的 max 值，各自 +1 后写入相同的
 * versionNo，破坏版本链唯一性。schema 中刻意未加 generationId/conversationId
 * 复合唯一约束（两维度混在一个约束里语义混乱），因此需要在应用层兜底。
 *
 * 修复：进入事务后先用 SELECT ... FOR UPDATE 锁定当前维度下的最新版本行。
 * 在 MariaDB(REPEATABLE READ) 下，该语句对命中的索引区间加间隙锁(gap lock)，
 * 阻止其他并发事务在同一 userId+维度下插入新行，从而保证「读 max → 写 +1」
 * 的原子性。外层的重试循环缓解锁等待 / 死锁导致的失败。
 *
 * generationId 优先（与路由白名单优先级一致）；两者皆空时退化为只按 userId 锁。
 */
async function createNextContentVersion(
  tx: Prisma.TransactionClient,
  params: {
    userId: string
    generationId: string | null
    conversationId: string | null
    format: string
    content: string
    source: string
  },
): Promise<AimContentVersion> {
  const { userId, generationId, conversationId, format, content, source } = params

  let locked: Array<{ id: string; versionNo: number }> = []
  if (generationId) {
    locked = await tx.$queryRaw<Array<{ id: string; versionNo: number }>>`
      SELECT id, versionNo FROM AimContentVersion
      WHERE userId = ${userId} AND generationId = ${generationId}
      ORDER BY versionNo DESC LIMIT 1
      FOR UPDATE
    `
  } else if (conversationId) {
    locked = await tx.$queryRaw<Array<{ id: string; versionNo: number }>>`
      SELECT id, versionNo FROM AimContentVersion
      WHERE userId = ${userId} AND conversationId = ${conversationId}
      ORDER BY versionNo DESC LIMIT 1
      FOR UPDATE
    `
  } else {
    locked = await tx.$queryRaw<Array<{ id: string; versionNo: number }>>`
      SELECT id, versionNo FROM AimContentVersion
      WHERE userId = ${userId}
      ORDER BY versionNo DESC LIMIT 1
      FOR UPDATE
    `
  }
  const latest = locked[0]

  return tx.aimContentVersion.create({
    data: {
      userId,
      generationId,
      conversationId,
      format,
      content,
      source,
      versionNo: (latest?.versionNo ?? 0) + 1,
      parentVersionId: latest?.id ?? null,
    },
  })
}
