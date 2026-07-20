import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const industry = searchParams.get("industry")
  const contentType = searchParams.get("contentType")
  const featured = searchParams.get("featured")
  const search = searchParams.get("search")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20))

  // Build where clause
  const where: Prisma.ContentTemplateWhereInput = { status: "published" }
  if (contentType) where.contentType = contentType
  if (featured === "true") where.featured = true
  if (search) {
    where.OR = [
      { displayName: { contains: search } },
      { description: { contains: search } },
    ]
  }

  // For industry filtering with JSON_CONTAINS, use raw filter
  // Prisma doesn't natively support JSON array contains on MySQL,
  // so we filter in application for simplicity at <100 templates
  let templates = await prisma.contentTemplate.findMany({
    where,
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true,
      displayName: true,
      description: true,
      hookType: true,
      industry: true,
      contentType: true,
      expressionBlueprint: true,
      tags: true,
      featured: true,
      usageCount: true,
      variables: true,
    },
  })

  // Application-level industry filter (JSON array)
  if (industry) {
    templates = templates.filter((t) => {
      const industries = t.industry as string[]
      return Array.isArray(industries) && industries.includes(industry)
    })
  }

  // Paginate
  const total = templates.length
  const paginated = templates.slice((page - 1) * pageSize, page * pageSize)

  return NextResponse.json(
    { data: { results: paginated, total, page, pageSize } },
    {
      headers: {
        "Cache-Control": "public, max-age=1800, s-maxage=1800",
      },
    }
  )
}
