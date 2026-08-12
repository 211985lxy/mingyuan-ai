import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { isValidTransition, invalidateTemplateCache } from "@/lib/template-state"
import { recordAdminAudit } from "@/lib/admin-audit"

export const POST = withAdminOrEditor(async (request, { admin, params }) => {
  const template = await prisma.contentTemplate.findUnique({
    where: { id: params?.id },
  })
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!isValidTransition(template.status, "published")) {
    return NextResponse.json(
      { error: `Cannot publish template in "${template.status}" status` },
      { status: 422 }
    )
  }

  const updated = await prisma.contentTemplate.update({
    where: { id: params?.id },
    data: { status: "published", publishedAt: new Date() },
  })
  await invalidateTemplateCache()
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "content_template.publish",
    targetType: "content_template",
    targetId: updated.id,
  })
  return NextResponse.json({ data: updated }, { headers: { "x-request-id": requestId } })
})
