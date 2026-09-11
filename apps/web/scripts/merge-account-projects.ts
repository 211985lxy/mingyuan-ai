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

const PROJECT_TABLES = [
  "AimGeneration", "AimMemory", "KnowledgeEntry", "KnowledgeEntity", "Script",
  "ContentGenerationRun", "TopicSelection", "Inspiration", "IpWikiPage",
  "CompetitorAnalysis", "WatchAccount", "VideoCopyExtraction", "BenchmarkProfile",
  "AssetCandidate", "OpportunityCollection", "UserQuestionCard", "ChannelBinding",
  "AimConversation", "ContentOutcome", "CustomerOutcomeProjection",
] as const

type ProjectTable = (typeof PROJECT_TABLES)[number]

async function existingProjectTables(prisma: PrismaClient): Promise<ProjectTable[]> {
  const tableNames = PROJECT_TABLES.map((table) => `'${table}'`).join(", ")
  const rows = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(
    `SELECT tables.TABLE_NAME AS tableName
       FROM information_schema.tables AS tables
       INNER JOIN information_schema.columns AS columns
         ON columns.table_schema = tables.table_schema
        AND columns.table_name = tables.table_name
      WHERE tables.table_schema = DATABASE()
        AND tables.table_name IN (${tableNames})
        AND columns.column_name = 'projectId'`,
  )
  const existing = new Set(rows.map((row) => row.tableName))
  return PROJECT_TABLES.filter((table) => existing.has(table))
}

async function summarizeProject(
  prisma: PrismaClient,
  projectId: string,
  projectTables: ProjectTable[],
) {
  const counts = await Promise.all(projectTables.map(async (table) => {
    const [result] = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\` WHERE \`projectId\` = ?`,
      projectId,
    )
    return [table, Number(result?.count ?? 0)] as const
  }))
  return Object.fromEntries(counts)
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

    const [projectTables, boundAccountCount] = await Promise.all([
      existingProjectTables(prisma),
      prisma.user.count({ where: { boundProjectId: source.id } }),
    ])
    const contentCounts = await summarizeProject(prisma, source.id, projectTables)
    const memberIds = [...new Set([
      target.userId,
      source.userId,
      ...source.members.map((member) => member.userId),
      ...source.boundAccounts.map((account) => account.id),
    ])]
    const conflictingBindings = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
        boundProjectId: { not: null, notIn: [source.id, target.id] },
      },
      select: { id: true },
    })
    if (conflictingBindings.length > 0) {
      throw new Error("a source or target member is already bound to another project")
    }
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
        where: {
          id: { in: memberIds },
          OR: [
            { boundProjectId: null },
            { boundProjectId: source.id },
            { boundProjectId: target.id },
          ],
        },
        data: {
          boundProjectId: target.id,
          projectBoundAt: new Date(),
          projectBindingSource: "project_merge",
        },
      })
      await Promise.all(projectTables.map((table) => tx.$executeRawUnsafe(
        `UPDATE \`${table}\` SET \`projectId\` = ? WHERE \`projectId\` = ?`,
        target.id,
        source.id,
      )))
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
