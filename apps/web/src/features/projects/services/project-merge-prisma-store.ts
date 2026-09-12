import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { MOVE_PROJECT_TABLES } from "@/features/projects/services/project-merge-policy"
import { lockClientProjects, lockUsers } from "@/features/projects/services/project-row-lock"
import {
  remapAllowedProjects,
  type MoveProjectTable,
  type ProjectMergeFailureAudit,
  type ProjectMergeIdentity,
  type ProjectMergeLockInput,
  type ProjectMergeMoveCounts,
  type ProjectMergeParticipant,
  type ProjectMergeProjectInfo,
  type ProjectMergeSnapshot,
  type ProjectMergeStore,
  type ProjectMergeSuccessAudit,
  type ProjectMergeTransaction,
} from "@/features/projects/services/project-merge-service"

type MergeDb = Prisma.TransactionClient | typeof prisma

const PROJECT_SELECT = {
  id: true,
  userId: true,
  status: true,
  members: { select: { userId: true } },
  boundAccounts: { select: { id: true } },
} as const

function parseAllowedProjects(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function projectStatus(status: string): ProjectMergeProjectInfo["status"] {
  if (status === "active" || status === "archived") return status
  return "inactive"
}

function toProjectInfo(
  project: {
    id: string
    userId: string
    status: string
    members: Array<{ userId: string }>
    boundAccounts: Array<{ id: string }>
  },
): ProjectMergeProjectInfo {
  return {
    projectId: project.id,
    ownerId: project.userId,
    status: projectStatus(project.status),
    members: project.members.map((member) => member.userId),
    boundAccounts: project.boundAccounts.map((account) => account.id),
  }
}

async function lockProjectMembers(tx: Prisma.TransactionClient, projectIds: string[]) {
  const ids = [...new Set(projectIds)].sort()
  if (ids.length === 0) return
  const placeholders = ids.map(() => "?").join(", ")
  await tx.$queryRawUnsafe(
    `SELECT \`id\` FROM \`ProjectMember\` WHERE \`projectId\` IN (${placeholders}) ORDER BY \`id\` FOR UPDATE`,
    ...ids,
  )
}

async function listDeployedProjectIdTables(db: MergeDb): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ tableName: string; TABLE_NAME?: string }>>(Prisma.sql`
    SELECT DISTINCT TABLE_NAME AS tableName
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND column_name = 'projectId'
  `)
  return rows
    .map((row) => String(row.tableName ?? row.TABLE_NAME ?? ""))
    .filter((name) => name.length > 0)
    .sort()
}

function emptyMoveCounts(): ProjectMergeMoveCounts {
  return Object.fromEntries(
    MOVE_PROJECT_TABLES.map((table) => [table, 0]),
  ) as ProjectMergeMoveCounts
}

function rawCountToNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

async function countSourceRowsByMoveTable(
  db: MergeDb,
  sourceProjectId: string,
  deployedTables: readonly string[],
): Promise<ProjectMergeMoveCounts> {
  const counts = emptyMoveCounts()
  const deployed = new Set(deployedTables)
  for (const table of MOVE_PROJECT_TABLES) {
    if (!deployed.has(table)) continue
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\` WHERE \`projectId\` = ?`,
      sourceProjectId,
    )
    counts[table] = rawCountToNumber(rows[0]?.count)
  }
  return counts
}

async function readProject(db: MergeDb, projectId: string, label: "source" | "target") {
  const project = await db.clientProject.findUnique({
    where: { id: projectId },
    select: PROJECT_SELECT,
  })
  if (!project) throw new Error(`${label} project not found: ${projectId}`)
  return project
}

async function loadAdmin(db: MergeDb, adminUserId: string | null) {
  if (!adminUserId) return { userId: "", status: "inactive" as const }
  const admin = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, isActive: true, role: true },
  })
  const active = admin?.isActive === true && admin.role === "admin"
  return { userId: adminUserId, status: active ? "active" as const : "inactive" as const }
}

async function loadParticipants(
  db: MergeDb,
  source: ProjectMergeProjectInfo,
  target: ProjectMergeProjectInfo,
): Promise<ProjectMergeParticipant[]> {
  const ids = [...new Set([
    source.ownerId,
    target.ownerId,
    ...source.members,
    ...target.members,
    ...source.boundAccounts,
    ...target.boundAccounts,
  ])].sort()
  if (ids.length === 0) return []
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, boundProjectId: true },
  })
  const boundById = new Map(users.map((user) => [user.id, user.boundProjectId]))
  return ids.map((userId) => ({
    userId,
    boundProjectId: boundById.get(userId) ?? null,
  }))
}

async function loadSnapshot(
  db: MergeDb,
  input: ProjectMergeIdentity,
  adminUserId: string | null,
): Promise<ProjectMergeSnapshot> {
  const sourceRow = await readProject(db, input.sourceProjectId, "source")
  const targetRow = await readProject(db, input.targetProjectId, "target")
  const deployedTables = await listDeployedProjectIdTables(db)
  const admin = await loadAdmin(db, adminUserId)
  const source = toProjectInfo(sourceRow)
  const target = toProjectInfo(targetRow)
  const sourceRowCounts = await countSourceRowsByMoveTable(db, source.projectId, deployedTables)
  const invocations = await db.agentInvocation.count({
    where: { projectId: source.projectId, status: { in: ["queued", "running"] } },
  })
  const traces = await db.aimExecutionTrace.count({
    where: { projectId: source.projectId, status: "running" },
  })
  const participants = await loadParticipants(db, source, target)
  return {
    source,
    target,
    deployedTables,
    sourceRowCounts,
    activeWork: { invocations, traces },
    participants,
    admin,
  }
}

export async function lockAndInspectProjectMerge(
  tx: Prisma.TransactionClient,
  input: ProjectMergeLockInput,
): Promise<ProjectMergeSnapshot> {
  await lockClientProjects(tx, [input.sourceProjectId, input.targetProjectId])
  const initialSource = toProjectInfo(await readProject(tx, input.sourceProjectId, "source"))
  const initialTarget = toProjectInfo(await readProject(tx, input.targetProjectId, "target"))
  await lockProjectMembers(tx, [input.sourceProjectId, input.targetProjectId])
  const participantIds = [...new Set([
    initialSource.ownerId,
    initialTarget.ownerId,
    ...initialSource.members,
    ...initialTarget.members,
    ...initialSource.boundAccounts,
    ...initialTarget.boundAccounts,
  ])].sort()
  await lockUsers(tx, participantIds)
  return loadSnapshot(tx, input, input.adminUserId)
}

async function upsertTargetMembers(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  targetOwnerId: string,
  userIds: string[],
) {
  for (const userId of userIds) {
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: targetProjectId, userId } },
      create: {
        projectId: targetProjectId,
        userId,
        role: userId === targetOwnerId ? "owner" : "member",
      },
      update: {},
    })
  }
}

async function rebindParticipants(
  tx: Prisma.TransactionClient,
  sourceProjectId: string,
  targetProjectId: string,
  participants: ProjectMergeParticipant[],
): Promise<number> {
  const userIds = participants
    .filter((participant) =>
      participant.boundProjectId === null || participant.boundProjectId === sourceProjectId)
    .map((participant) => participant.userId)
  if (userIds.length === 0) return 0
  const updated = await tx.user.updateMany({
    where: {
      id: { in: userIds },
      OR: [{ boundProjectId: null }, { boundProjectId: sourceProjectId }],
    },
    data: {
      boundProjectId: targetProjectId,
      projectBoundAt: new Date(),
      projectBindingSource: "project_merge",
    },
  })
  return updated.count
}

async function remapApiKeys(
  tx: Prisma.TransactionClient,
  sourceProjectId: string,
  targetProjectId: string,
  userIds: string[],
): Promise<number> {
  if (userIds.length === 0) return 0
  const keys = await tx.agentApiKey.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, allowedProjects: true },
  })
  let rewritten = 0
  for (const key of keys) {
    const allowed = parseAllowedProjects(key.allowedProjects)
    if (!allowed.includes(sourceProjectId)) continue
    await tx.agentApiKey.update({
      where: { id: key.id },
      data: { allowedProjects: remapAllowedProjects(allowed, sourceProjectId, targetProjectId) },
    })
    rewritten += 1
  }
  return rewritten
}

async function moveRows(
  tx: Prisma.TransactionClient,
  table: MoveProjectTable,
  sourceProjectId: string,
  targetProjectId: string,
): Promise<number> {
  if (!(MOVE_PROJECT_TABLES as readonly string[]).includes(table)) {
    throw new Error(`unknown deployed table: ${table}`)
  }
  const count = await tx.$executeRawUnsafe(
    `UPDATE \`${table}\` SET \`projectId\` = ? WHERE \`projectId\` = ?`,
    targetProjectId,
    sourceProjectId,
  )
  return Number(count)
}

async function archiveSource(tx: Prisma.TransactionClient, sourceProjectId: string): Promise<number> {
  const updated = await tx.clientProject.updateMany({
    where: { id: sourceProjectId },
    data: { status: "archived" },
  })
  return updated.count
}

async function writeSuccessAudit(
  tx: Prisma.TransactionClient,
  input: ProjectMergeSuccessAudit,
): Promise<string> {
  const audit = await tx.adminAuditLog.create({
    data: {
      adminId: input.input.adminUserId,
      action: "account.project_merge",
      targetType: "ClientProject",
      targetId: input.input.targetProjectId,
      requestId: input.input.requestId,
      correlationId: input.input.requestId,
      status: "success",
      severity: "warning",
      metadata: {
        source: input.input.sourceProjectId,
        target: input.input.targetProjectId,
        reason: input.input.reason,
        participantCount: input.participantIds.length,
        moveCounts: input.moveCounts,
        movedRows: input.movedRows,
        remappedApiKeys: input.remapCount,
      },
    },
  })
  return audit.id
}

function createMergeTransaction(tx: Prisma.TransactionClient): ProjectMergeTransaction {
  return {
    lockAndInspect: (input) => lockAndInspectProjectMerge(tx, input),
    upsertTargetMembers: (targetProjectId, targetOwnerId, userIds) =>
      upsertTargetMembers(tx, targetProjectId, targetOwnerId, userIds),
    rebindParticipants: (sourceProjectId, targetProjectId, participants) =>
      rebindParticipants(tx, sourceProjectId, targetProjectId, participants),
    remapApiKeys: (sourceProjectId, targetProjectId, userIds) =>
      remapApiKeys(tx, sourceProjectId, targetProjectId, userIds),
    moveRows: (table, sourceProjectId, targetProjectId) =>
      moveRows(tx, table, sourceProjectId, targetProjectId),
    archiveSource: (sourceProjectId) => archiveSource(tx, sourceProjectId),
    writeSuccessAudit: (input) => writeSuccessAudit(tx, input),
  }
}

async function writeFailedAudit(input: ProjectMergeFailureAudit): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: input.input.adminUserId,
        action: "account.project_merge",
        targetType: "ClientProject",
        targetId: input.input.targetProjectId,
        requestId: input.input.requestId,
        correlationId: input.input.requestId,
        status: "failed",
        severity: "warning",
        metadata: {
          source: input.input.sourceProjectId,
          target: input.input.targetProjectId,
          reason: input.reason,
        },
      },
    })
  } catch {
    // Keep the original merge error if the failure audit cannot be written.
  }
}

export const prismaProjectMergeStore: ProjectMergeStore = {
  inspect: (input) => loadSnapshot(prisma, input, null),
  transaction: (run) =>
    prisma.$transaction((tx) => run(createMergeTransaction(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    }),
  writeFailedAudit,
}
