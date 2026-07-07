import { prisma } from "@/lib/prisma"

export const LAUNCH_RULES = {
  MIN_CURATED_STRUCTURES: 3,
  MIN_CURATED_PACKAGING_TEMPLATES: 1,
  MIN_SCRIPT_QUALITY_SCORE: 50,
  SCRIPT_LENGTH_RANGE: { min: 45, max: 480 },
  MAX_GENERATION_RETRIES: 2,
  ALLOW_DEGRADED_SCRIPTS: true,
  DEFAULT_STYLE_ID: "6904552d68f703003047c54f",
}

export async function checkLaunchReadiness(): Promise<{ ready: boolean; issues: string[] }> {
  const issues: string[] = []

  const structureCount = await prisma.videoStructure.count({ where: { status: "published" } })
  if (structureCount < LAUNCH_RULES.MIN_CURATED_STRUCTURES) {
    issues.push(`需要至少 ${LAUNCH_RULES.MIN_CURATED_STRUCTURES} 个已发布的视频结构（当前: ${structureCount}）`)
  }

  const packagingCount = await prisma.videoPackagingTemplate.count({ where: { status: "published" } })
  if (packagingCount < LAUNCH_RULES.MIN_CURATED_PACKAGING_TEMPLATES) {
    issues.push(`需要至少 ${LAUNCH_RULES.MIN_CURATED_PACKAGING_TEMPLATES} 个已发布的包装模板（当前: ${packagingCount}）`)
  }

  return { ready: issues.length === 0, issues }
}
