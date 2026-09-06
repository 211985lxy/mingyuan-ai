import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { checkUrlType, parseUrl } from "@/lib/tikhub/url-parser"
import { getCompetitorPlatformGate } from "@/lib/competitor-analysis/platform-scope"
import { resolveCompetitorProfileInput } from "@/lib/competitor-analysis/profile-url"
import { enforceCountBetaLimit } from "@/lib/internal-beta-limits"
import { watchAccountCreateBodySchema } from "@/features/competitor/contracts/api"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const GET = withUserAuth(async (request, { user }) => {
  const url = new URL(request.url)
  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId: url.searchParams.get("projectId"),
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  const accounts = await prisma.watchAccount.findMany({
    where: { userId: user.id, projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return NextResponse.json({ items: accounts })
})

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, watchAccountCreateBodySchema, { maxBytes: 4 * 1024 })

  const rawUrl = typeof body.url === "string" ? body.url.trim() : ""
  if (!rawUrl) {
    return NextResponse.json({ error: "请输入抖音主页链接；视频号可搜昵称添加" }, { status: 400 })
  }

  const urlTypeError = checkUrlType(rawUrl)
  if (urlTypeError) {
    return NextResponse.json({ error: urlTypeError }, { status: 400 })
  }

  // Parse and validate URL
  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return NextResponse.json({ error: "不支持的平台" }, { status: 400 })
  }

  const platformGate = getCompetitorPlatformGate(parsed.platform)
  if (!platformGate.supported) {
    return NextResponse.json({
      error: platformGate.message ?? "当前版本暂不支持该平台",
    }, { status: 400 })
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

  let resolved
  try {
    resolved = await resolveCompetitorProfileInput(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : "链接解析失败，请换一个主页链接重试"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Check if already exists
  const existing = await prisma.watchAccount.findFirst({
    where: { userId: user.id, projectId, targetUrl: resolved.targetUrl },
  })
  if (existing) {
    return NextResponse.json({ error: "该账号已在监控列表中" }, { status: 409 })
  }

  const limitResponse = await enforceCountBetaLimit({ userId: user.id, kind: "watch_account" })
  if (limitResponse) return limitResponse

  const account = await prisma.watchAccount.create({
    data: {
      userId: user.id,
      projectId,
      targetUrl: resolved.targetUrl,
      platform: parsed.platform,
      platformUserId: resolved.platformUserId,
    },
  })

  return NextResponse.json(account, { status: 201 })
})
