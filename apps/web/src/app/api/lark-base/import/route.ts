import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import {
  importLarkBaseKnowledge,
  setEmbeddingHook,
  type LarkTableType,
} from "@/lib/lark-base-tool"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"

// Register the embedding hook for lark imports that happen through the API
setEmbeddingHook(ensureKnowledgeEmbedding)

const TABLE_TYPES = new Set(["topic_review", "project_management", "data_archive"])

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
    if (typeof body.tableType !== "string" || !TABLE_TYPES.has(body.tableType)) {
      return NextResponse.json({ error: "tableType 无效" }, { status: 400 })
    }

    const result = await importLarkBaseKnowledge({
      userId: user.id,
      projectId: body.projectId.trim(),
      tableType: body.tableType as LarkTableType,
      db: prisma,
    })

    return NextResponse.json(result)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "飞书导入失败" },
      { status: 500 },
    )
  }
}
