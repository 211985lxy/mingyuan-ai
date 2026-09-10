/**
 * Merge one client project into another canonical project without deleting data.
 *
 * Default mode is a read-only preview. Apply mode requires both --apply and an
 * exact --confirm <target-project-id> acknowledgement.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

function option(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function createPrismaClient() {
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      charset: "utf8mb4",
      connectionLimit: 5,
    }),
  })
}

async function summarizeProject(prisma: PrismaClient, projectId: string) {
  const [
    aimGenerations,
    aimMemories,
    knowledgeEntries,
    knowledgeEntities,
    scripts,
    contentGenerationRuns,
    topicSelections,
    inspirations,
    ipWikiPages,
    competitorAnalyses,
    watchAccounts,
    videoCopyExtractions,
    benchmarkProfiles,
    assetCandidates,
    opportunityCollections,
    userQuestionCards,
    channelBindings,
    aimConversations,
    contentOutcomes,
    customerOutcomes,
  ] = await Promise.all([
    prisma.aimGeneration.count({ where: { projectId } }),
    prisma.aimMemory.count({ where: { projectId } }),
    prisma.knowledgeEntry.count({ where: { projectId } }),
    prisma.knowledgeEntity.count({ where: { projectId } }),
    prisma.script.count({ where: { projectId } }),
    prisma.contentGenerationRun.count({ where: { projectId } }),
    prisma.topicSelection.count({ where: { projectId } }),
    prisma.inspiration.count({ where: { projectId } }),
    prisma.ipWikiPage.count({ where: { projectId } }),
    prisma.competitorAnalysis.count({ where: { projectId } }),
    prisma.watchAccount.count({ where: { projectId } }),
    prisma.videoCopyExtraction.count({ where: { projectId } }),
    prisma.benchmarkProfile.count({ where: { projectId } }),
    prisma.assetCandidate.count({ where: { projectId } }),
    prisma.opportunityCollection.count({ where: { projectId } }),
    prisma.userQuestionCard.count({ where: { projectId } }),
    prisma.channelBinding.count({ where: { projectId } }),
    prisma.aimConversation.count({ where: { projectId } }),
    prisma.contentOutcome.count({ where: { projectId } }),
    prisma.customerOutcomeProjection.count({ where: { projectId } }),
  ])

  return {
    aimGenerations,
    aimMemories,
    knowledgeEntries,
    knowledgeEntities,
    scripts,
    contentGenerationRuns,
    topicSelections,
    inspirations,
    ipWikiPages,
    competitorAnalyses,
    watchAccounts,
    videoCopyExtractions,
    benchmarkProfiles,
    assetCandidates,
    opportunityCollections,
    userQuestionCards,
    channelBindings,
    aimConversations,
    contentOutcomes,
    customerOutcomes,
  }
}

async function main() {
  const sourceProjectId = option("--source-project")
  const targetProjectId = option("--target-project")
  const apply = process.argv.includes("--apply")
  const confirmation = option("--confirm")
  if (!sourceProjectId || !targetProjectId) {
    throw new Error("usage: --source-project <id> --target-project <id> [--apply --confirm <target-project-id>]")
  }
  if (sourceProjectId === targetProjectId) {
    throw new Error("source and target projects must differ")
  }
  if (apply && confirmation !== targetProjectId) {
    throw new Error("--confirm must equal --target-project")
  }

  const prisma = createPrismaClient()
  try {
    const [source, target] = await Promise.all([
      prisma.clientProject.findUnique({
        where: { id: sourceProjectId },
        select: {
          id: true,
          userId: true,
          name: true,
          status: true,
          members: { select: { userId: true } },
          boundAccounts: { select: { id: true } },
        },
      }),
      prisma.clientProject.findUnique({
        where: { id: targetProjectId },
        select: { id: true, userId: true, name: true, status: true },
      }),
    ])
    if (!source) throw new Error("source project not found")
    if (!target) throw new Error("target project not found")
    if (target.status !== "active") throw new Error("target project must be active")
    if (source.status === "archived") throw new Error("source project is already archived")

    const [contentCounts, boundAccountCount] = await Promise.all([
      summarizeProject(prisma, source.id),
      prisma.user.count({ where: { boundProjectId: source.id } }),
    ])
    const memberIds = [...new Set([
      source.userId,
      ...source.members.map((member) => member.userId),
      ...source.boundAccounts.map((account) => account.id),
    ])]
    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      source: { id: source.id, name: source.name, status: source.status },
      target: { id: target.id, name: target.name, status: target.status },
      move: contentCounts,
      memberCount: memberIds.length,
      boundAccountCount,
    }))
    if (!apply) {
      console.log("dry-run only; no database changes were made")
      return
    }

    await prisma.$transaction(async (tx) => {
      for (const userId of memberIds) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: target.id, userId } },
          create: {
            projectId: target.id,
            userId,
            role: userId === target.userId ? "owner" : "member",
          },
          update: {},
        })
      }
      await tx.user.updateMany({
        where: { boundProjectId: source.id },
        data: {
          boundProjectId: target.id,
          projectBoundAt: new Date(),
          projectBindingSource: "project_merge",
        },
      })
      await Promise.all([
        tx.aimGeneration.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.aimMemory.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.knowledgeEntry.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.knowledgeEntity.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.script.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.contentGenerationRun.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.topicSelection.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.inspiration.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.ipWikiPage.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.competitorAnalysis.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.watchAccount.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.videoCopyExtraction.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.benchmarkProfile.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.assetCandidate.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.opportunityCollection.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.userQuestionCard.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.channelBinding.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.aimConversation.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.contentOutcome.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
        tx.customerOutcomeProjection.updateMany({ where: { projectId: source.id }, data: { projectId: target.id } }),
      ])
      await tx.clientProject.update({ where: { id: source.id }, data: { status: "archived" } })
    })
    console.log("project merge applied; source project archived and no records deleted")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("project merge failed:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
