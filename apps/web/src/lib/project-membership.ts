import type { PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export type SharedProject = {
  id: string
  name: string
  status: string
}

const projectSelect = {
  id: true,
  name: true,
  status: true,
} as const

type ProjectMemberDelegate = {
  findFirst: (args: {
    where: {
      userId: string
      projectId: string
      project: { is: { status: string } }
    }
    select: { project: { select: typeof projectSelect } }
  }) => Promise<{ project: SharedProject } | null>
  findMany: (args: {
    where: { projectId: string }
    select: { userId: true }
  }) => Promise<Array<{ userId: string }>>
  upsert: (args: {
    where: { projectId_userId: { projectId: string; userId: string } }
    create: { projectId: string; userId: string; role: "owner" | "member" }
    update: Record<string, never>
  }) => Promise<unknown>
}

type ProjectMemberDb = { projectMember?: ProjectMemberDelegate }

function projectMemberDelegate(db: unknown): ProjectMemberDelegate | undefined {
  return (db as ProjectMemberDb).projectMember
}

export async function findBoundProjectForAccount(
  db: Pick<PrismaClient, "clientProject"> & ProjectMemberDb,
  input: { userId: string; projectId: string },
): Promise<SharedProject | null> {
  const ownedProject = await db.clientProject.findFirst({
    where: { id: input.projectId, userId: input.userId, status: "active" },
    select: projectSelect,
  })
  if (ownedProject) return ownedProject

  const member = await projectMemberDelegate(db)?.findFirst({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      project: { is: { status: "active" } },
    },
    select: { project: { select: projectSelect } },
  })
  return member?.project ?? null
}

/** Return all accounts that may act on project-level records, without duplicates. */
export async function getProjectMemberUserIds(projectId: string): Promise<string[]> {
  const project = await prisma.clientProject.findUnique({
    where: { id: projectId },
    select: { userId: true, members: { select: { userId: true } } },
  })
  if (!project) return []
  return [...new Set([project.userId, ...project.members.map((member) => member.userId)])]
}

export async function upsertProjectMembership(
  db: unknown,
  input: { projectId: string; userId: string; role: "owner" | "member" },
): Promise<void> {
  await projectMemberDelegate(db)?.upsert({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    create: input,
    update: {},
  })
}
