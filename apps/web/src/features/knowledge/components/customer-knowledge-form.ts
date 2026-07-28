export interface CustomerKnowledgeForm {
  title: string
  content: string
  category: string
  tags: string
  projectId: string
}

export const EMPTY_CUSTOMER_KNOWLEDGE_FORM: CustomerKnowledgeForm = {
  title: "",
  content: "",
  category: "boss_experience",
  tags: "",
  projectId: "none",
}

export function parseCustomerKnowledgeTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

export function formatKnowledgeUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
