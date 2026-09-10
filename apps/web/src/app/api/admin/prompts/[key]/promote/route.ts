import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { withAdminOnly } from "@/lib/admin-auth"
import { parseJsonBody } from "@/lib/api-contract"
import { promotePromptVersion } from "@/lib/prompt/admin"
// api-inventory: domain=prompt
// api-inventory: kind=management
// api-inventory: orchestratable=false


const promoteBodySchema = z
  .object({
    version: z.number().int().min(1),
    toStatus: z.enum(["qualified", "active"]),
  })
  .strict()

/**
 * POST /api/admin/prompts/[key]/promote
 * 按门禁升级版本状态：→ qualified 需 fixtureKey；→ active 只能从 qualified。
 * 激活时同 key 其余 active 版本自动回落 qualified（active 唯一）。
 * 门禁拒绝返回 409 PROMPT_PROMOTION_REJECTED。
 */
export const POST = withAdminOnly(async (
  request: NextRequest,
  { params }: { params?: Record<string, string> },
) => {
  const key = params?.key ?? ""
  const body = await parseJsonBody(request, promoteBodySchema)

  const result = await promotePromptVersion({
    key,
    version: body.version,
    toStatus: body.toStatus,
  })

  return NextResponse.json({
    data: {
      key,
      version: result.version.version,
      status: result.version.status,
      demotedToQualified: result.demoted,
    },
  })
})
