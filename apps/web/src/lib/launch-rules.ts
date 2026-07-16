import { prisma } from "@/lib/prisma"

export const LAUNCH_RULES = {
  MIN_CURATED_STRUCTURES: 3,
  MIN_SCRIPT_QUALITY_SCORE: 50,
  SCRIPT_LENGTH_RANGE: { min: 45, max: 480 },
  MAX_GENERATION_RETRIES: 2,
  ALLOW_DEGRADED_SCRIPTS: true,
}

export async function checkLaunchReadiness(): Promise<{ ready: boolean; issues: string[] }> {
  const issues: string[] = []

  const structureCount = await prisma.videoStructure.count({ where: { status: "published" } })
  if (structureCount < LAUNCH_RULES.MIN_CURATED_STRUCTURES) {
    issues.push(`需要至少 ${LAUNCH_RULES.MIN_CURATED_STRUCTURES} 个已发布的内容结构（当前: ${structureCount}）`)
  }

  return { ready: issues.length === 0, issues }
}
