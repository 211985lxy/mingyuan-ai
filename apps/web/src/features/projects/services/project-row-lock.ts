import type { Prisma } from "@/generated/prisma/client"

export async function lockClientProjects(tx: Prisma.TransactionClient, projectIds: string[]) {
  const ids = [...new Set(projectIds)].sort()
  if (ids.length === 0) return
  const placeholders = ids.map(() => "?").join(", ")
  await tx.$queryRawUnsafe(
    `SELECT \`id\` FROM \`ClientProject\` WHERE \`id\` IN (${placeholders}) ORDER BY \`id\` FOR UPDATE`,
    ...ids,
  )
}

export async function lockUsers(tx: Prisma.TransactionClient, userIds: string[]) {
  const ids = [...new Set(userIds)].sort()
  if (ids.length === 0) return
  const placeholders = ids.map(() => "?").join(", ")
  await tx.$queryRawUnsafe(
    `SELECT \`id\` FROM \`User\` WHERE \`id\` IN (${placeholders}) ORDER BY \`id\` FOR UPDATE`,
    ...ids,
  )
}
