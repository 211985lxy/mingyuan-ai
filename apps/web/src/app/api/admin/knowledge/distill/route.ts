import { parseCapabilityInput } from "@/lib/api/contracts"
import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { LLMClient } from "@/lib/llm/client"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"
// api-inventory: domain=knowledge
// api-inventory: kind=capability
// api-inventory: orchestratable=false


// 知识库蒸馏：用 DeepSeek 对指定知识条目做精炼/合并/分类建议
export const POST = withAdminOrEditor(async (request) => {
  const { ids } = (await parseCapabilityInput("/api/admin/knowledge/distill", request)) as {
    ids: string[]
  }

  const entries = await prisma.knowledgeEntry.findMany({
    where: { id: { in: ids }, status: "active" },
    select: { id: true, title: true, content: true, category: true, tags: true },
    take: 50,
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
        content: promptRegistry.get(PROMPT_KEYS.knowledgeDistillSystem).content,
      },
      {
        role: "user",
        content: fillPromptTemplate(
          promptRegistry.get(PROMPT_KEYS.knowledgeDistillUser).content,
          { entryCount: String(entries.length), contentBlock },
        ),
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
