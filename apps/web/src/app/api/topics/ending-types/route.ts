import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

export const GET = withUserAuth(async () => {
  const types = await prisma.endingType.findMany({
    where: { status: "published" },
    orderBy: { sortOrder: "asc" },
    take: 200,
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      guidance: true,
    },
  })

  return NextResponse.json({ data: types })
})
