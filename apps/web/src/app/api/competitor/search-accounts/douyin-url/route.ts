import { NextResponse } from "next/server"
import { z } from "zod"

import { parseJsonBody } from "@/lib/api-contract"
import { resolveRedFoxDouyinProfileUrl } from "@/lib/redfox/douyin-users"
import { withUserAuth } from "@/lib/user-auth"

const bodySchema = z.object({
  accountId: z.string().trim().min(1).max(200),
}).strict()

export const POST = withUserAuth(async (request) => {
  const body = await parseJsonBody(request, bodySchema, { maxBytes: 4 * 1024 })
  try {
    const targetUrl = await resolveRedFoxDouyinProfileUrl(body.accountId)
    return NextResponse.json({ targetUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析抖音账号主页失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
