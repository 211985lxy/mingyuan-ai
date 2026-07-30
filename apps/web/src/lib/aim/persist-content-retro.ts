/**
 * 复盘对话成功后：追加 retroSnapshot + 沉淀知识库（需已选项目与目标内容）。
 */

import { createKnowledge } from "@/lib/api/knowledge"
import { updateAimWorkflowStatus } from "@/lib/api/projects"
import {
  buildRetroKnowledgeContent,
  buildRetroKnowledgeTags,
} from "@/lib/aim/retro-knowledge"

export async function persistContentRetroAfterChat(input: {
  projectId?: string | null
  generationId?: string | null
  retroBody: string
  source: "paste" | "chat"
}): Promise<{ savedKnowledge: boolean; savedSnapshot: boolean; warning?: string }> {
  const body = input.retroBody.trim()
  const generationId = input.generationId?.trim()
  if (!body || !generationId) {
    return { savedKnowledge: false, savedSnapshot: false, warning: "缺少复盘正文或目标内容，未沉淀" }
  }

  let savedSnapshot = false
  try {
    await updateAimWorkflowStatus(generationId, {
      retroSnapshot: {
        summary: body.slice(0, 500),
        actualData: "见结构化发布数据 / 对话上下文",
        verdict: "对话复盘",
        nextRule: body.slice(0, 300),
      },
    })
    savedSnapshot = true
  } catch {
    // 快照失败不阻断知识库；调用方可见 warning
  }

  const projectId = input.projectId?.trim()
  if (!projectId) {
    return {
      savedKnowledge: false,
      savedSnapshot,
      warning: savedSnapshot
        ? "已写入复盘快照；要沉淀知识库请先选择 IP 营销全案"
        : "复盘快照写入失败，且未选项目无法沉淀知识库",
    }
  }

  await createKnowledge({
    projectId,
    category: "user_insight",
    title: `内容数据复盘 · ${generationId.slice(0, 8)}`,
    content: buildRetroKnowledgeContent({
      generationId,
      retroBody: body,
    }),
    tags: buildRetroKnowledgeTags({
      generationId,
      source: input.source,
    }),
    sourceType: input.source === "paste" ? "import" : "manual",
  })

  return { savedKnowledge: true, savedSnapshot }
}
