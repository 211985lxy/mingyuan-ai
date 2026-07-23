import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { loadKnowledgeAssetHealth } from "@/lib/knowledge-asset-health-server"

/**
 * GET — 管理端项目知识资产健康度（全量 slim 扫描，不走列表分页）
 */
export const GET = withAdminAuth(async (request) => {
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? ""
  if (!projectId || projectId === "unbound") {
    return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
  }

  const payload = await loadKnowledgeAssetHealth({ projectId })
  return NextResponse.json({ data: payload })
})
