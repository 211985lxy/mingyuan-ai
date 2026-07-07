import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { getTemplateDetail, getTemplates } from "@/lib/shanjian"
import { inferPackagingTemplateCapabilities } from "@/lib/video-template-config"

// ─── POST /api/packaging-templates/sync ───────────────

export const POST = withUserAuth(async () => {
  const { results } = await getTemplates("virtualman")

  let synced = 0

  for (const template of results) {
    let capabilities: string[] = []

    try {
      const detail = await getTemplateDetail(template.id)
      capabilities = inferPackagingTemplateCapabilities(detail)
    } catch (error) {
      console.warn(
        `[packaging-templates/sync] Failed to load detail for template ${template.id}`,
        error,
      )
    }

    await prisma.videoPackagingTemplate.upsert({
      where: { shanjianId: template.id },
      update: {
        name: template.name,
        coverUrl: template.coverUrl,
        demoUrl: template.demoUrl,
        scene: template.scene || "virtualman",
        capabilities,
        lastSyncedAt: new Date(),
      },
      create: {
        shanjianId: template.id,
        name: template.name,
        coverUrl: template.coverUrl,
        demoUrl: template.demoUrl,
        scene: template.scene || "virtualman",
        capabilities,
        lastSyncedAt: new Date(),
      },
    })
    synced++
  }

  return NextResponse.json({ data: { synced } })
})
