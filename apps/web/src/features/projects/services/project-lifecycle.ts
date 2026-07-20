import { prisma } from "@/lib/prisma"

const EXPORT_LIMIT = 5_000

function assertWithinExportLimit(name: string, rows: unknown[]) {
  if (rows.length > EXPORT_LIMIT) {
    throw new Error(`${name} 超过 ${EXPORT_LIMIT} 条，请联系管理员分批导出`)
  }
}

/**
 * @description 移除projectfromallowedprojects
 * @param value - 值
 * @param projectId - 项目 ID
 * @returns string[]
 */
export function removeProjectFromAllowedProjects(value: unknown, projectId: string): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === "string" && id !== projectId)
}

/**
 * @description 导出ownedproject
 * @param userId - 用户 ID
 * @param projectId - 项目 ID
 * @returns 无返回值
 */
export async function exportOwnedProject(userId: string, projectId: string) {
  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId },
  })
  if (!project) return null

  const [knowledge, generations, memories, wikiPages, benchmarkProfiles] = await Promise.all([
    prisma.knowledgeEntry.findMany({ where: { userId, projectId }, orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT + 1 }),
    prisma.aimGeneration.findMany({ where: { userId, projectId }, orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT + 1 }),
    prisma.aimMemory.findMany({ where: { userId, projectId }, orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT + 1 }),
    prisma.ipWikiPage.findMany({ where: { userId, projectId }, orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT + 1 }),
    prisma.benchmarkProfile.findMany({
      where: { userId, projectId },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT + 1 } },
      take: EXPORT_LIMIT + 1,
    }),
  ])

  for (const [name, rows] of Object.entries({ knowledge, generations, memories, wikiPages, benchmarkProfiles })) {
    assertWithinExportLimit(name, rows)
  }
  for (const profile of benchmarkProfiles) assertWithinExportLimit("benchmarkProfileItems", profile.items)

  return {
    exportedAt: new Date().toISOString(),
    project,
    knowledge,
    generations,
    memories,
    wikiPages,
    benchmarkProfiles,
  }
}

/**
 * @description permanentlydeleteownedproject
 * @param userId - 用户 ID
 * @param projectId - 项目 ID
 * @returns 无返回值
 */
export async function permanentlyDeleteOwnedProject(userId: string, projectId: string) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.clientProject.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    })
    if (!project) return null

    const keys = await tx.agentApiKey.findMany({ where: { userId }, select: { id: true, allowedProjects: true }, take: 100 })
    for (const key of keys) {
      await tx.agentApiKey.update({
        where: { id: key.id },
        data: { allowedProjects: removeProjectFromAllowedProjects(key.allowedProjects, projectId) },
      })
    }

    const deleted = {
      snapshots: (await tx.aimRunSnapshot.deleteMany({ where: { userId, projectId } })).count,
      traces: (await tx.aimExecutionTrace.deleteMany({ where: { userId, projectId } })).count,
      apiLogs: (await tx.agentApiCallLog.deleteMany({ where: { userId, projectId } })).count,
      benchmarkProfiles: (await tx.benchmarkProfile.deleteMany({ where: { userId, projectId } })).count,
      wikiPages: (await tx.ipWikiPage.deleteMany({ where: { userId, projectId } })).count,
      memories: (await tx.aimMemory.deleteMany({ where: { userId, projectId } })).count,
      knowledgeEntries: (await tx.knowledgeEntry.deleteMany({ where: { userId, projectId } })).count,
      knowledgeEntities: (await tx.knowledgeEntity.deleteMany({ where: { userId, projectId } })).count,
      generations: (await tx.aimGeneration.deleteMany({ where: { userId, projectId } })).count,
    }
    await tx.clientProject.delete({ where: { id: projectId, userId } })
    return deleted
  })
}
