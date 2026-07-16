import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withUserAuth } from '@/lib/user-auth'
import { parseQuery } from "@/lib/api-contract"
import { competitorReportsQuerySchema } from "@/features/competitor/contracts/api"

export const GET = withUserAuth(async (request, { user }) => {
  const { page = 1, limit = 10, targetUrl } = parseQuery(request, competitorReportsQuerySchema)
  const skip = (page - 1) * limit
  const where = {
    userId: user.id,
    ...(targetUrl ? { targetUrl } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.competitorAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        platform: true,
        targetUrl: true,
        status: true,
        accountName: true,
        accountAvatar: true,
        followerCount: true,
        overallScore: true,
        collectionSource: true,
        fallbackUsed: true,
        fallbackReason: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    }),
    prisma.competitorAnalysis.count({
      where,
    }),
  ])

  return NextResponse.json({
    items: items.map(item => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
    total,
    page,
    limit,
  })
})
