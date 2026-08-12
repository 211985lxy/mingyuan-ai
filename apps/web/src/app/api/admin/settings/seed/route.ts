import { NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { invalidateBrandingCache } from "@/lib/branding"
import { prisma } from "@/lib/prisma"
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/system-setting-definitions"

export const POST = withAdminOnly(async (_request, { admin }) => {
  let created = 0

  for (const setting of DEFAULT_SYSTEM_SETTINGS) {
    const existing = await prisma.systemSetting.findUnique({
      where: { key: setting.key },
    })
    if (!existing) {
      await prisma.systemSetting.create({
        data: {
          ...setting,
          updatedBy: admin.id,
        },
      })
      created++
    }
  }

  await invalidateBrandingCache()

  return NextResponse.json({
    data: { seeded: created, total: DEFAULT_SYSTEM_SETTINGS.length },
  })
})
