import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

export const GET = withUserAuth(async () => {
  const structures = await prisma.copyStructure.findMany({
    where: { status: "published" },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      beats: true,
      caseStudy: true,
    },
  })

  return NextResponse.json({ data: structures })
})
