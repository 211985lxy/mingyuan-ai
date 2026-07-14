import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { invalidateBrandingCache, isBrandingSettingKey } from "@/lib/branding"
import { prisma } from "@/lib/prisma"
import { recordAdminAudit } from "@/lib/admin-audit"

export const PUT = withAdminAuth(async (request: NextRequest, { admin, params }) => {
  const key = params?.key
  if (!key) {
    return NextResponse.json({ error: "Key required" }, { status: 400 })
  }

  const { value } = await parseJsonRecord(request)
  if (value === undefined) {
    return NextResponse.json({ error: "Value required" }, { status: 400 })
  }

  const existing = await prisma.systemSetting.findUnique({
    where: { key: decodeURIComponent(key) },
  })
  if (!existing) {
    return NextResponse.json({ error: "Setting not found" }, { status: 404 })
  }

  // Type validation
  if (existing.type === "number" && isNaN(Number(value))) {
    return NextResponse.json(
      { error: "Value must be a valid number" },
      { status: 400 }
    )
  }
  if (existing.type === "boolean" && !["true", "false"].includes(String(value))) {
    return NextResponse.json(
      { error: "Value must be true or false" },
      { status: 400 }
    )
  }
  if (existing.type === "json") {
    try {
      JSON.parse(String(value))
    } catch {
      return NextResponse.json(
        { error: "Value must be valid JSON" },
        { status: 400 }
      )
    }
  }

  const setting = await prisma.systemSetting.update({
    where: { key: decodeURIComponent(key) },
    data: {
      value: String(value),
      updatedBy: admin.id,
    },
  })

  if (isBrandingSettingKey(setting.key)) {
    await invalidateBrandingCache()
  }

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "system_setting.update",
    targetType: "system_setting",
    targetId: setting.key,
    metadata: { type: setting.type, category: setting.category },
  })

  return NextResponse.json({ data: setting }, { headers: { "x-request-id": requestId } })
}, "admin")
