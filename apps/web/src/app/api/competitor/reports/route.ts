import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withUserAuth } from '@/lib/user-auth'

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)))
  const targetUrl = searchParams.get('targetUrl')?.trim()
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
