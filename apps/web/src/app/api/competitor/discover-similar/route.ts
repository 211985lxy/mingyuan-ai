import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { checkUrlType, parseUrl } from "@/lib/tikhub/url-parser"
import { getCompetitorPlatformGate } from "@/lib/competitor-analysis/platform-scope"
import { resolveCompetitorProfileInput } from "@/lib/competitor-analysis/profile-url"
import {
  discoverDouyinSimilarAccounts,
  discoverXhsSimilarAccounts,
} from "@/lib/competitor-analysis/redfox-similar-accounts"
import { resolveRedFoxDouyinAccountId } from "@/lib/competitor-analysis/redfox-douyin-api"
import { competitorDiscoverBodySchema } from "@/features/competitor/contracts/api"

/**
 * POST /api/competitor/discover-similar
 *
 * Body: { targetUrl: string }
 *
 * 支持抖音和小红书主页链接，返回同阶对标 + 头部标杆。
 */
export const POST = withUserAuth(async (request) => {
  const body = await parseJsonBody(request, competitorDiscoverBodySchema, { maxBytes: 4 * 1024 })

  const rawUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : ""
  if (!rawUrl) {
    return NextResponse.json(
      { error: "请输入抖音或小红书主页链接" },
      { status: 400 },
    )
  }

  const urlTypeError = checkUrlType(rawUrl)
  if (urlTypeError) {
    return NextResponse.json({ error: urlTypeError }, { status: 400 })
  }

  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return NextResponse.json({ error: "不支持的平台" }, { status: 400 })
  }

  const platformGate = getCompetitorPlatformGate(parsed.platform)
  if (!platformGate.supported) {
    return NextResponse.json({
      error: platformGate.message ?? "当前平台暂不支持对标账号发现",
    }, { status: 400 })
  }

  try {
    const resolved = await resolveCompetitorProfileInput(parsed)
    let result
    if (parsed.platform === 'xiaohongshu') {
      if (!resolved.platformUserId) {
        return NextResponse.json({ error: "无法从链接中提取账号 ID" }, { status: 400 })
      }
      result = await discoverXhsSimilarAccounts({ redId: resolved.platformUserId })
    } else {
      const accountId = await resolveRedFoxDouyinAccountId({
        targetUrl: resolved.targetUrl,
        platformUserId: resolved.platformUserId,
      })
      result = await discoverDouyinSimilarAccounts({ accountId })
    }
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "相似账号发现失败"
    if (message.includes("未收录") || message.includes("未找到账号信息")) {
      return NextResponse.json(
        {
          error: "这个账号暂时不在对标账号库里，当前无法自动发现同赛道账号。你可以先添加监控并刷新作品池，或换一个更成熟、作品更多的同行账号再试。",
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
