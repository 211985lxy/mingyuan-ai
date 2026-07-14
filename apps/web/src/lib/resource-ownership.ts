import { prisma } from "@/lib/prisma"

export async function ownsActiveProject(userId: string, projectId: string): Promise<boolean> {
  if (!projectId) return false

  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  })
  return Boolean(project)
}
