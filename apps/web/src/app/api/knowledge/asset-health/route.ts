import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { ownsActiveProject } from "@/lib/resource-ownership"
import { loadKnowledgeAssetHealth } from "@/lib/knowledge-asset-health-server"

/**
 * GET — 用户端项目知识资产健康度（项目隔离）
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }

    if (!(await ownsActiveProject(user.id, projectId))) {
      return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 })
    }

    const payload = await loadKnowledgeAssetHealth({
      projectId,
      userId: user.id,
    })
    return NextResponse.json({ data: payload })
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "知识资产健康度读取失败" }, { status: 500 })
    )
  }
}
