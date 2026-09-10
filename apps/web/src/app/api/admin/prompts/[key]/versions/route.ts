import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { withAdminOnly } from "@/lib/admin-auth"
import { parseJsonBody } from "@/lib/api-contract"
import { createPromptDraftVersion } from "@/lib/prompt/admin"
// api-inventory: domain=prompt
// api-inventory: kind=management
// api-inventory: orchestratable=false


const draftBodySchema = z
  .object({
    content: z.string().trim().min(1, "content 必填").max(100_000),
    fixtureKey: z.string().trim().max(120).optional(),
    domain: z.string().trim().max(40).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()

/**
 * POST /api/admin/prompts/[key]/versions
 * 新建草稿版本（版本号自增；未登记 key 的首个版本需提供 domain）。
 */
export const POST = withAdminOnly(async (
  request: NextRequest,
  { params }: { params?: Record<string, string> },
) => {
  const key = params?.key ?? ""
  const body = await parseJsonBody(request, draftBodySchema, { maxBytes: 256 * 1024 })

  const created = await createPromptDraftVersion({
    key,
    content: body.content,
    fixtureKey: body.fixtureKey ?? null,
    domain: body.domain,
    description: body.description ?? null,
  })

  return NextResponse.json({
    data: {
      id: created.id,
      key: created.templateKey,
      version: created.version,
      status: created.status,
      fixtureKey: created.fixtureKey,
    },
  })
})
