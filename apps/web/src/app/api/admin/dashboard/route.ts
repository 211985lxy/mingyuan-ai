import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    generationsToday,
    activeTemplates,
    recentFetchSuccess,
    recentFetchFailed,

    // Pending knowledge: entries without value grade or without cleaned tags
    pendingKnowledgeCount,

    // Failed embeddings
    failedEmbeddingCount,

    // Pending benchmark profiles (status=active but minimal items)
    pendingProfilesCount,

    // Recent failed traces
    recentFailedTraces,

    // Recent new users (last 7 days)
    recentUsers,

    // Recent audit logs
    recentLogs,

    // Activation code stats
    codeTotal,
    codeUnused,
    codeUsed,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.aimGeneration.count({ where: { createdAt: { gte: today } } }),
    prisma.contentTemplate.count({ where: { status: "published" } }),
    prisma.douyinHotSnapshot.count({ where: { fetchedAt: { gte: oneDayAgo }, status: "success" } }),
    prisma.douyinHotSnapshot.count({ where: { fetchedAt: { gte: oneDayAgo }, status: "failed" } }),

    // Entries with no valueGrade or no embedding (pending processing)
    prisma.knowledgeEntry.count({
      where: {
        status: "active",
        OR: [
          { valueGrade: null },
          { valueGrade: "" },
        ],
      },
    }),

    // Failed embeddings
    prisma.knowledgeEmbedding.count({ where: { status: "failed" } }),

    // Active profiles with 0 items
    prisma.benchmarkProfile.count({
      where: { status: "active", items: { none: {} } },
    }),

    // Failed traces in last 24h
    prisma.aimExecutionTrace.count({
      where: { createdAt: { gte: oneDayAgo }, status: "failed" },
    }),

    // Recent users
    prisma.user.findMany({
      select: { id: true, name: true, email: true, plan: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Recent audit logs
    prisma.adminAuditLog.findMany({
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    // Activation code stats
    prisma.activationCode.count(),
    prisma.activationCode.count({ where: { status: "unused" } }),
    prisma.activationCode.count({ where: { status: "used" } }),
  ])

  const codeUsageRate = codeTotal > 0 ? Math.round((codeUsed / codeTotal) * 100) : 0

  return NextResponse.json({
    data: {
      // Original fields (backward compatible)
      totalUsers,
      generationsToday,
      activeTemplates,
      hotListHealth: {
        successLast24h: recentFetchSuccess,
        failedLast24h: recentFetchFailed,
      },

      // New pending fields
      pendingKnowledgeCount,
      failedEmbeddingCount,
      pendingProfilesCount,
      recentFailedTraces,

      // Activation code stats
      codeStats: {
        total: codeTotal,
        unused: codeUnused,
        used: codeUsed,
        usageRate: codeUsageRate,
      },

      // Recent activity
      recentUsers: recentUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        plan: u.plan,
        createdAt: u.createdAt.toISOString(),
      })),
      recentLogs: recentLogs.map((l) => ({
        id: l.id,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  })
})
