import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { isValidTransition, invalidateTemplateCache } from "@/lib/template-state"

export const POST = withAdminAuth(async (_request, { params }) => {
  const template = await prisma.contentTemplate.findUnique({
    where: { id: params?.id },
  })
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!isValidTransition(template.status, "published")) {
    return NextResponse.json(
      { error: `Cannot restore template in "${template.status}" status` },
      { status: 422 }
    )
  }

  const updated = await prisma.contentTemplate.update({
    where: { id: params?.id },
    data: { status: "published", publishedAt: new Date(), archivedAt: null },
  })
  await invalidateTemplateCache()
  return NextResponse.json({ data: updated })
})
