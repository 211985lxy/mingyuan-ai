import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { BUILT_IN_ACCOUNT_SOURCE_BINDINGS } from "@/lib/account-industry-sources"
import {
  buildHotSourceBinding,
  HOT_SOURCE_CATEGORY,
  hotSourceSettingKey,
  parseAccountSourceBinding,
} from "@/lib/hot-source-settings"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async () => {
  const settings = await prisma.systemSetting.findMany({
    where: { category: HOT_SOURCE_CATEGORY },
    orderBy: { updatedAt: "desc" },
    take: 500,
  })
  const rows = settings.flatMap((setting) => {
    const binding = parseAccountSourceBinding(setting.value)
    if (!binding) return []
    return binding.sources.map((source) => ({
      key: setting.key,
      email: binding.email,
      sourceName: source.source_name,
      sourceUrl: source.source_url,
      sourceType: source.source_type || "static",
      enabled: source.status !== "inactive",
      note: source.note || "",
      isBuiltIn: false,
      updatedAt: setting.updatedAt.toISOString(),
    }))
  })
  const configuredEmails = new Set(rows.map((row) => row.email.toLowerCase()))
  const builtInRows = BUILT_IN_ACCOUNT_SOURCE_BINDINGS
    .filter((binding) => !configuredEmails.has(binding.email.toLowerCase()))
    .flatMap((binding) =>
      binding.sources.map((source) => ({
        key: hotSourceSettingKey(binding.email),
        email: binding.email,
        sourceName: source.source_name,
        sourceUrl: source.source_url,
        sourceType: source.source_type || "static",
        enabled: source.status !== "inactive",
        note: source.note || "",
        isBuiltIn: true,
        updatedAt: null,
      }))
    )

  return NextResponse.json({ data: [...rows, ...builtInRows] })
}, "admin")

export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  const body = await parseJsonRecord(request)
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const sourceName = typeof body.sourceName === "string" ? body.sourceName.trim() : ""
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : ""
  const sourceType = typeof body.sourceType === "string" ? body.sourceType.trim() : "static"
  const note = typeof body.note === "string" ? body.note.trim() : ""
  const enabled = body.enabled !== false

  if (!email || !sourceName || !sourceUrl) {
    return NextResponse.json(
      { error: "email, sourceName, and sourceUrl are required" },
      { status: 400 }
    )
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "email is invalid" }, { status: 400 })
  }
  if (!sourceUrl.startsWith("/") && !/^https?:\/\//.test(sourceUrl)) {
    return NextResponse.json(
      { error: "sourceUrl must be a relative path or http(s) URL" },
      { status: 400 }
    )
  }

  const binding = buildHotSourceBinding({
    email,
    sourceName,
    sourceUrl,
    sourceType,
    note,
    enabled,
  })
  const key = hotSourceSettingKey(email)

  const setting = await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: JSON.stringify(binding, null, 2),
      type: "json",
      category: HOT_SOURCE_CATEGORY,
      description: `热点精选账号信源：${email}`,
      updatedBy: admin.id,
    },
    update: {
      value: JSON.stringify(binding, null, 2),
      type: "json",
      category: HOT_SOURCE_CATEGORY,
      description: `热点精选账号信源：${email}`,
      updatedBy: admin.id,
    },
  })

  return NextResponse.json({ data: setting })
}, "admin")
