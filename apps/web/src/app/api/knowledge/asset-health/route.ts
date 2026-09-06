import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { loadKnowledgeAssetHealth } from "@/lib/knowledge-asset-health-server"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

/**
 * GET — 用户端项目知识资产健康度（项目隔离）
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const requestedProjectId = new URL(request.url).searchParams.get("projectId")?.trim() || undefined
    const projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId,
    })).id

    const payload = await loadKnowledgeAssetHealth({
      projectId,
      userId: user.id,
    })
    return NextResponse.json({ data: payload })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "知识资产健康度读取失败" }, { status: 500 })
    )
  }
}
