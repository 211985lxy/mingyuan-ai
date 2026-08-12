import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const PUT = withAdminOrEditor(async (request, { params }) => {
  const { featured } = await parseJsonRecord(request)
  if (typeof featured !== "boolean") {
    return NextResponse.json({ error: "featured must be a boolean" }, { status: 400 })
  }

  const updated = await prisma.contentTemplate.update({
    where: { id: params?.id },
    data: { featured },
  })
  return NextResponse.json({ data: updated })
})
