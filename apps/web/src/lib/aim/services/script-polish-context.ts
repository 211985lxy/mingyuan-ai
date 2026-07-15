import { prisma } from "@/lib/prisma"

const CATEGORY_LABELS: Record<string, string> = {
  boss_experience: "老板经验",
  product_usp: "产品卖点",
  customer_pain: "客户痛点",
  project_case: "项目案例",
  customer_qa: "客户问答",
}

export async function loadProjectKnowledge(userId: string, projectId?: string): Promise<string> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      userId,
      status: "active",
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
    },
    orderBy: { sortOrder: "asc" },
    take: 200,
  })
  if (entries.length === 0) return ""

  const grouped = new Map<string, typeof entries>()
  for (const entry of entries) {
    const list = grouped.get(entry.category) || []
    list.push(entry)
    grouped.set(entry.category, list)
  }

  let block = "\n=== 企业知识库 ===\n"
  for (const [category, items] of grouped) {
    block += `\n【${CATEGORY_LABELS[category] || category}】\n`
    for (const item of items) {
      block += `- ${item.title}：${item.content}\n`
    }
  }
  return block
}
