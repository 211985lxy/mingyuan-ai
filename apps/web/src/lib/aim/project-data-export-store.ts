import { prisma } from "@/lib/prisma"
import type { ProjectExportSource } from "@/lib/aim/project-data-export"
import { PROJECT_EXPORT_LIMITS } from "@/lib/aim/project-data-export"

const extraTake = 1

async function loadProjectMeta(projectId: string, fallback: ProjectExportSource["project"]) {
  const row = await prisma.clientProject.findFirst({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      companyName: true,
      industry: true,
      targetCustomer: true,
      offer: true,
      deliveryGoal: true,
    },
  })
  return row ?? fallback
}

async function loadGenerations(userId: string, projectId: string) {
  return prisma.aimGeneration.findMany({
    where: { userId, projectId },
    orderBy: { createdAt: "desc" },
    take: PROJECT_EXPORT_LIMITS.generations + extraTake,
    select: {
      id: true,
      topicTitle: true,
      agentId: true,
      workflowStatus: true,
      publishedAt: true,
      publishPlatform: true,
      publishUrl: true,
      videoScript: true,
      wechatArticle: true,
      createdAt: true,
    },
  })
}

async function loadKnowledge(userId: string, projectId: string) {
  return prisma.knowledgeEntry.findMany({
    where: { userId, projectId, status: "active" },
    orderBy: { createdAt: "desc" },
    take: PROJECT_EXPORT_LIMITS.knowledge + extraTake,
    select: {
      id: true,
      category: true,
      title: true,
      content: true,
      tags: true,
      valueGrade: true,
      createdAt: true,
    },
  })
}

async function loadWikiAndAssets(userId: string, projectId: string) {
  const [wikiPages, assets] = await Promise.all([
    prisma.ipWikiPage.findMany({
      where: { userId, projectId, status: "active" },
      orderBy: { updatedAt: "desc" },
      take: PROJECT_EXPORT_LIMITS.wikiPages + extraTake,
      select: { id: true, pageType: true, title: true, content: true, updatedAt: true },
    }),
    prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PROJECT_EXPORT_LIMITS.assets + extraTake,
      select: { id: true, name: true, assetType: true, url: true, createdAt: true },
    }),
  ])
  return { wikiPages, assets }
}

export async function loadProjectExportSource(input: {
  userId: string
  project: ProjectExportSource["project"]
}): Promise<ProjectExportSource> {
  const projectId = input.project.id
  const [project, generations, knowledge, rest] = await Promise.all([
    loadProjectMeta(projectId, input.project),
    loadGenerations(input.userId, projectId),
    loadKnowledge(input.userId, projectId),
    loadWikiAndAssets(input.userId, projectId),
  ])
  const generationIds = generations.map((row) => row.id)
  const outcomes = generationIds.length === 0
    ? []
    : await prisma.contentOutcome.findMany({
        where: { userId: input.userId, generationId: { in: generationIds } },
        orderBy: { collectedAt: "desc" },
        take: PROJECT_EXPORT_LIMITS.outcomes + extraTake,
        select: {
          id: true,
          generationId: true,
          platform: true,
          collectWindowDay: true,
          views: true,
          likes: true,
          comments: true,
          saves: true,
          shares: true,
          collectedAt: true,
        },
      })
  return { project, generations, knowledge, outcomes, wikiPages: rest.wikiPages, assets: rest.assets }
}
