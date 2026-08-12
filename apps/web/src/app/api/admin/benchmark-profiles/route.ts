import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

const ALLOWED_PLATFORMS = new Set(["douyin", "xiaohongshu", "wechat_channels", "bilibili", "kuaishou"])

// GET — 真实档案列表（支持按项目/状态/平台/搜索筛选 + 分页）
export const GET = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") ?? ""
  const status = searchParams.get("status") ?? "active"
  const search = searchParams.get("search") ?? ""
  const platform = searchParams.get("platform") ?? ""

  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20))
  const skip = (page - 1) * pageSize

  const where: Record<string, unknown> = { status }
  if (projectId) where.projectId = projectId
  if (platform) where.platform = platform
  if (search) where.name = { contains: search }

  const [profiles, total] = await Promise.all([
    prisma.benchmarkProfile.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
      include: {
        project: {
          select: { id: true, name: true, companyName: true, industry: true, status: true },
        },
        user: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          take: 2,
          select: { id: true, kind: true, title: true, content: true },
        },
        _count: { select: { items: true } },
      },
    }),
    prisma.benchmarkProfile.count({ where }),
  ])

  return NextResponse.json({ data: profiles, total, page, pageSize })
})

// POST — 新建真实档案（必须指定 projectId，去重时返回 duplicate flag）
export const POST = withAdminOrEditor(async (request) => {
  const body = await parseJsonRecord(request)
  const {
    name,
    platform,
    accountUrl,
    platformUserId,
    followerCount,
    personaTags,
    positioning,
    differentiator,
    takeaways,
    notes,
  } = body

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "账号名称必填" }, { status: 400 })
  }
  if (platform && !ALLOWED_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "不支持的平台" }, { status: 400 })
  }

  // 必须指定 projectId
  const projectId = typeof body.projectId === "string" && body.projectId.trim()
    ? body.projectId.trim()
    : null

  if (!projectId) {
    return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
  }

  const project = await prisma.clientProject.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  })

  if (!project) {
    return NextResponse.json({ error: "归属项目不存在" }, { status: 404 })
  }

  // 同名去重检查（同项目 + 同名 + 同状态）
  const existingProfile = await prisma.benchmarkProfile.findFirst({
    where: {
      projectId: project.id,
      name: name.trim(),
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  })

  if (existingProfile) {
    return NextResponse.json({ data: existingProfile, duplicate: true })
  }

  const profile = await prisma.benchmarkProfile.create({
    data: {
      userId: project.userId,
      projectId: project.id,
      name: name.trim(),
      platform: platform || "douyin",
      accountUrl: typeof accountUrl === "string" ? accountUrl.trim() || null : null,
      platformUserId: typeof platformUserId === "string" ? platformUserId.trim() || null : null,
      followerCount: Number.isFinite(Number(followerCount)) ? Number(followerCount) : null,
      personaTags: Array.isArray(personaTags) ? personaTags : [],
      positioning: typeof positioning === "string" ? positioning || null : null,
      differentiator: typeof differentiator === "string" ? differentiator || null : null,
      takeaways: typeof takeaways === "string" ? takeaways || null : null,
      notes: typeof notes === "string" ? notes || null : null,
      status: "active",
    },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json({ data: profile }, { status: 201 })
})
