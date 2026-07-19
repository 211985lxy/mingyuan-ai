import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { invalidateBrandingCache, isBrandingSettingKey } from "@/lib/branding"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async () => {
  const settings = await prisma.systemSetting.findMany({
    where: { category: { notIn: ["hot-sources", "agent_guides"] } },
    orderBy: [{ category: "asc" }, { key: "asc" }],
    take: 1_000,
  })

  // Group by category
  const grouped: Record<string, typeof settings> = {}
  for (const s of settings) {
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  }

  return NextResponse.json({ data: grouped })
})

export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  const { key, value, type, category, description } = await parseJsonRecord(request)

  if (!key || value === undefined || !type || !category) {
    return NextResponse.json(
      { error: "key, value, type, and category are required" },
      { status: 400 }
    )
  }

  // Validate key format
  if (!/^[a-z0-9-]+$/.test(key)) {
    return NextResponse.json(
      { error: "Key must be lowercase alphanumeric with dashes" },
      { status: 400 }
    )
  }

  // Check uniqueness
  const existing = await prisma.systemSetting.findUnique({ where: { key } })
  if (existing) {
    return NextResponse.json(
      { error: "Setting with this key already exists" },
      { status: 409 }
    )
  }

  const setting = await prisma.systemSetting.create({
    data: {
      key,
      value: String(value),
      type,
      category,
      description: description || null,
      updatedBy: admin.id,
    },
  })

  if (isBrandingSettingKey(setting.key)) {
    await invalidateBrandingCache()
  }

  return NextResponse.json({ data: setting }, { status: 201 })
}, "admin")
