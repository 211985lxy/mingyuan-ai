import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { LLMClient } from "@/lib/llm/client"

// 知识库蒸馏：用 DeepSeek 对指定知识条目做精炼/合并/分类建议
export const POST = withAdminAuth(async (request) => {
  const body = await request.json()
  const { ids } = body as { ids?: string[] }

  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: "ids 必填" }, { status: 400 })
  }

  const entries = await prisma.knowledgeEntry.findMany({
    where: { id: { in: ids }, status: "active" },
    select: { id: true, title: true, content: true, category: true, tags: true },
  })

  if (entries.length === 0) {
    return NextResponse.json({ error: "未找到知识条目" }, { status: 404 })
  }

  const contentBlock = entries
    .map(
      (e, i) =>
        `[${i + 1}] 标题: ${e.title}\n分类: ${e.category}\n标签: ${JSON.stringify(e.tags)}\n内容: ${e.content.slice(0, 2000)}`
    )
    .join("\n\n---\n\n")

  const llm = LLMClient.shared()
  const result = await llm.complete({
    messages: [
      {
        role: "system",
        content: `你是知识库管理专家。请分析以下知识条目，输出 JSON 格式的分析结果（不要 markdown 代码块标记）：

{
  "distilled": [  // 精炼后的条目（可以合并同类项、去重）
    { "index": 1, "suggestedTitle": "更精炼的标题", "suggestedContent": "精简后的内容（200字以内）", "suggestedCategory": "建议的分类", "tags": ["标签1", "标签2"], "action": "keep|merge|archive" }
  ],
  "duplicates": [ [1, 3] ],  // 重复条目索引对
  "suggestions": "对这个知识库的整体优化建议（100字以内）"
}`,
      },
      {
        role: "user",
        content: `请分析以下 ${entries.length} 条知识条目：\n\n${contentBlock}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 4000,
    responseFormat: { type: "json_object" },
  })

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result.content)
  } catch {
    return NextResponse.json({ error: "AI 分析结果解析失败" }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      entryCount: entries.length,
      result: parsed,
    },
  })
})
