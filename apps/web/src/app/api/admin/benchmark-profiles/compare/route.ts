import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

/** 跨平台对比时单个 name 命中的账号上限：平台数有限，超出视为异常。 */
const COMPARE_PROFILE_LIMIT = 200

/**
 * GET /api/admin/benchmark-profiles/compare?name=xxx&projectId=xxx
 * 跨平台竞品对比：按账号名称聚合同一 IP 在不同平台的画像数据
 */
export const GET = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get("name")?.trim()
  const projectId = searchParams.get("projectId")?.trim()

  if (!name) {
    return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 })
  }

  const where: Record<string, unknown> = {
    status: 'active',
    name: { contains: name },
  }
  if (projectId) where.projectId = projectId

  const profiles = await prisma.benchmarkProfile.findMany({
    where,
    orderBy: { platform: 'asc' },
    take: COMPARE_PROFILE_LIMIT,
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  })

  // 按平台分组
  const platformMap = new Map<string, Array<{
    id: string
    name: string
    platform: string
    accountUrl: string | null
    platformUserId: string | null
    followerCount: number | null
    positioning: string | null
    differentiator: string | null
    takeaways: string | null
    personaTags: unknown
    itemCount: number
    projectName: string
  }>>()

  for (const p of profiles) {
    const entry = {
      id: p.id,
      name: p.name,
      platform: p.platform,
      accountUrl: p.accountUrl,
      platformUserId: p.platformUserId,
      followerCount: p.followerCount,
      positioning: p.positioning,
      differentiator: p.differentiator,
      takeaways: p.takeaways,
      personaTags: p.personaTags,
      itemCount: p._count.items,
      projectName: p.project.name,
    }
    const list = platformMap.get(p.platform) ?? []
    list.push(entry)
    platformMap.set(p.platform, list)
  }

  const PLATFORM_LABELS: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    wechat_channels: '视频号',
    bilibili: 'B站',
    kuaishou: '快手',
  }

  return NextResponse.json({
    query: name,
    totalProfiles: profiles.length,
    platforms: Array.from(platformMap.entries()).map(([platform, items]) => ({
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      profiles: items,
    })),
    isCrossPlatform: platformMap.size > 1,
  })
})
