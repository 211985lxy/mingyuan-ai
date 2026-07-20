import { prisma } from "@/lib/prisma"

/**
 * @description 检查用户是否拥有指定的活跃项目（用于资源归属权限校验）
 * @param userId - 用户 ID
 * @param projectId - 项目 ID
 * @returns 用户拥有该活跃项目返回 true，否则返回 false
 */
export async function ownsActiveProject(userId: string, projectId: string): Promise<boolean> {
  if (!projectId) return false

  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  })
  return Boolean(project)
}
