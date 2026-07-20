import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { exportLarkBaseResult, type LarkResultType } from "@/lib/lark-base-tool"

const RESULT_TYPES = new Set(["topic", "script", "positioning", "moments_copy"])

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)

    if (typeof body.projectId !== "string" || !body.projectId.trim()) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    if (typeof body.resultId !== "string" || !body.resultId.trim()) {
      return NextResponse.json({ error: "resultId 必填" }, { status: 400 })
    }
    if (typeof body.resultType !== "string" || !RESULT_TYPES.has(body.resultType)) {
      return NextResponse.json({ error: "resultType 无效" }, { status: 400 })
    }

    const result = await exportLarkBaseResult({
      userId: user.id,
      projectId: body.projectId.trim(),
      resultType: body.resultType as LarkResultType,
      resultId: body.resultId.trim(),
      db: prisma,
    })

    return NextResponse.json(result)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "飞书回写失败" },
      { status: 500 },
    )
  }
}
