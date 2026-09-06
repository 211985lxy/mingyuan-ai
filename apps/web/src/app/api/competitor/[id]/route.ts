import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withUserAuth } from '@/lib/user-auth'
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = (params as { id: string }).id

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

  const analysis = await prisma.competitorAnalysis.findFirst({
    where: { id, userId: user.id, projectId },
  })

  if (!analysis) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  // Extract extra account fields from rawAccountData if available
  const raw = analysis.rawAccountData as Record<string, unknown> | null
  const accountSignature = (raw?.signature as string) ?? null
  const accountTotalLikes = (raw?.totalLikes as number) ?? null
  const accountFollowingCount = (raw?.followingCount as number) ?? null
  const accountIsVerified = (raw?.isVerified as boolean) ?? false
  const accountVerifyInfo = (raw?.verifyInfo as string) ?? null

  return NextResponse.json({
    id: analysis.id,
    status: analysis.status,
    platform: analysis.platform,
    targetUrl: analysis.targetUrl,

    // Progressive fields (populated as pipeline advances)
    accountName: analysis.accountName ?? null,
    accountAvatar: analysis.accountAvatar ?? null,
    followerCount: analysis.followerCount ?? null,
    videoCount: analysis.videoCount ?? null,

    // Extended account info
    accountSignature,
    accountTotalLikes,
    accountFollowingCount,
    accountIsVerified,
    accountVerifyInfo,

    metricsData: analysis.metricsData ?? null,
    analysisResult: analysis.analysisResult ?? null,
    overallScore: analysis.overallScore ?? null,
    collectionSource: analysis.collectionSource ?? null,
    fallbackUsed: analysis.fallbackUsed,
    fallbackReason: analysis.fallbackReason ?? null,

    errorMessage: analysis.errorMessage ?? null,

    createdAt: analysis.createdAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
  })
})

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = (params as { id: string }).id

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

  // id + userId + projectId 条件删除：属于其他项目（或空项目）的记录一律视为不存在。
  const result = await prisma.competitorAnalysis.deleteMany({
    where: { id, userId: user.id, projectId },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
})
