import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAdminOrEditor } from "@/lib/admin-auth"

export const GET = withAdminOrEditor(async (_request, { admin }) => {
  const record = await prisma.adminUser.findUnique({
    where: { id: admin.id },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!record) return NextResponse.json({ error: "Admin not found" }, { status: 404 })
  return NextResponse.json({ admin: record })
})
