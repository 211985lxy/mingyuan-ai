import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  extractStyleProfileDelta,
  normalizeStyleMessages,
  upsertMainStyleProfile,
} from "@/lib/aim-style-evolution"
import { ownsActiveProject } from "@/lib/resource-ownership"
import { aimEvolveStyleBodySchema } from "@/features/aim/contracts/api"

// 提取 + 合并两次 LLM 调用，给足时间
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, aimEvolveStyleBodySchema, { maxBytes: 256 * 1024 })
    const messages = normalizeStyleMessages(body.messages)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""

    if (projectId && !(await ownsActiveProject(user.id, projectId))) {
      return NextResponse.json({ error: "IP 营销全案不存在或已归档" }, { status: 404 })
    }

    if (messages.length < 2) {
      return NextResponse.json({ delta: null, profile: null, reason: "对话太少" })
    }

    const delta = await extractStyleProfileDelta({ messages })
    if (!delta) {
      // 这轮对话没有值得沉淀的长期写作风格
      return NextResponse.json({ delta: null, profile: null, reason: "no_style" })
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const result = await upsertMainStyleProfile({ userId: user.id, delta, stamp, projectId: projectId || null })

    return NextResponse.json({
      delta: { evidence: delta.evidence, confidence: delta.confidence },
      profile: { id: result.id, title: result.title },
      created: result.created,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/evolve-style] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "写作风格提炼失败" },
      { status: 500 },
    )
  }
}
