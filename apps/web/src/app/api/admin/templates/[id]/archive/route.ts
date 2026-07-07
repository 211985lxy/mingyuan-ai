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
  if (!isValidTransition(template.status, "archived")) {
    return NextResponse.json(
      { error: `Cannot archive template in "${template.status}" status` },
      { status: 422 }
    )
  }

  const updated = await prisma.contentTemplate.update({
    where: { id: params?.id },
    data: { status: "archived", archivedAt: new Date() },
  })
  await invalidateTemplateCache()
  return NextResponse.json({ data: updated })
})
