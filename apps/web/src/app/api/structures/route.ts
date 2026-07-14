import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  CANONICAL_STRUCTURE_NAMES,
  syncCanonicalVideoStructures,
} from "../../../../prisma/seed-structures"

// ─── GET /api/structures ──────────────────────────────

export const GET = withUserAuth(async () => {
  await syncCanonicalVideoStructures(prisma)

  const structures = await prisma.videoStructure.findMany({
    where: {
      status: "published",
      name: { in: CANONICAL_STRUCTURE_NAMES },
    },
    orderBy: { sortOrder: "asc" },
    take: CANONICAL_STRUCTURE_NAMES.length,
  })

  return NextResponse.json({ data: structures })
})
