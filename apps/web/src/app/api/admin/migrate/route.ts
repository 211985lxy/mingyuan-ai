import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAdminAuth } from "@/lib/admin-auth"

/**
 * Run safe ALTER TABLE migrations that add missing columns.
 * MySQL-compatible: no IF NOT EXISTS — catch duplicate errors instead.
 */
export const POST = withAdminAuth(async () => {
  const results: string[] = []

  const migrations = [
    // Phase 14: ContentGenerationRun topic selection fields
    `ALTER TABLE ContentGenerationRun ADD COLUMN topicSelectionId VARCHAR(191) NULL`,
    `ALTER TABLE ContentGenerationRun ADD COLUMN openingTypeCode VARCHAR(50) NULL`,
    `ALTER TABLE ContentGenerationRun ADD COLUMN copyStructureCode VARCHAR(50) NULL`,
    `ALTER TABLE ContentGenerationRun ADD COLUMN endingTypeCode VARCHAR(50) NULL`,
    `ALTER TABLE ContentGenerationRun ADD INDEX ContentGenerationRun_topicSelectionId_idx (topicSelectionId)`,
    // Phase 14: Script topic selection fields
    `ALTER TABLE Script ADD COLUMN topicSelectionId VARCHAR(191) NULL`,
    `ALTER TABLE Script ADD COLUMN isHotTopicVersion BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE Script ADD INDEX Script_topicSelectionId_idx (topicSelectionId)`,
  ]

  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql)
      results.push(`OK: ${sql.substring(0, 80)}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("Duplicate")) {
        results.push(`SKIP: ${sql.substring(0, 60)} (already exists)`)
      } else {
        results.push(`FAIL: ${sql.substring(0, 60)} — ${msg.substring(0, 100)}`)
      }
    }
  }

  return NextResponse.json({ data: { results } })
})
