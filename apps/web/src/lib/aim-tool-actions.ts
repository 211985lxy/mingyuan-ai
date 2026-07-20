import { prisma } from "@/lib/prisma"
import { exportLarkBaseResult, importLarkBaseKnowledge, setEmbeddingHook } from "@/lib/lark-base-tool"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"

// Register embedding hook for lark imports through chat
setEmbeddingHook(ensureKnowledgeEmbedding)

export interface LarkToolActionParams {
  userId: string
  projectId: string
  resultId: string
}

/**
 * @description 处理飞书工具动作（导入选题、导入项目数据、导出生成结果）
 * @param toolAction - 工具动作名称
 * @param params - 动作参数（用户 ID、项目 ID、结果 ID）
 * @returns 处理结果（提示内容和工具结果）
 */
export async function handleLarkToolAction(
  toolAction: string,
  params: LarkToolActionParams
): Promise<{ content: string; toolResult?: unknown }> {
  const { userId, projectId, resultId } = params

  if (toolAction === "import_lark_topics") {
    const result = await importLarkBaseKnowledge({
      userId,
      projectId,
      tableType: "topic_review",
      db: prisma,
    })
    return {
      content: `已同步飞书选题：新增 ${result.created} 条，更新 ${result.updated} 条。`,
      toolResult: result,
    }
  }

  if (toolAction === "import_lark_project_data" || toolAction === "import_lark_archive_data") {
    const result = await importLarkBaseKnowledge({
      userId,
      projectId,
      tableType: toolAction === "import_lark_project_data" ? "project_management" : "data_archive",
      db: prisma,
    })
    return {
      content: `已导入飞书数据：新增 ${result.created} 条，更新 ${result.updated} 条。`,
      toolResult: result,
    }
  }

  if (toolAction === "export_lark_generation") {
    if (!resultId) {
      throw new Error("缺少要回写的 AIM 结果")
    }
    await exportLarkBaseResult({
      userId,
      projectId,
      resultType: "script",
      resultId,
      db: prisma,
    })
    return { content: "已把这条 AIM 内容回写到飞书。" }
  }

  throw new Error("不支持的工具动作")
}
