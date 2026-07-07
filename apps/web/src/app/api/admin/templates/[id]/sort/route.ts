import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const PUT = withAdminAuth(async (request, { params }) => {
  const { sortOrder } = await request.json()
  if (typeof sortOrder !== "number") {
    return NextResponse.json({ error: "sortOrder must be a number" }, { status: 400 })
  }

  const updated = await prisma.contentTemplate.update({
    where: { id: params?.id },
    data: { sortOrder },
  })
  return NextResponse.json({ data: updated })
})
