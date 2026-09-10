import { NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { listPromptTemplates } from "@/lib/prompt/admin"
// api-inventory: domain=prompt
// api-inventory: kind=management
// api-inventory: orchestratable=false


/**
 * GET /api/admin/prompts
 * 全部 prompt 模板及其版本（管理界面列表）。
 */
export async function GET() {
  const templates = await listPromptTemplates()
  return NextResponse.json({
    data: {
      templates: templates.map((template) => ({
        key: template.key,
        domain: template.domain,
        description: template.description,
        versions: (template.versions ?? []).map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          type: version.type,
          fixtureKey: version.fixtureKey,
          createdAt: version.createdAt,
          contentPreview: version.content.slice(0, 120),
          contentLength: version.content.length,
        })),
      })),
    },
  })
}
