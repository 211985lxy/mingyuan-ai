import {
  CATEGORY_LABELS,
  SOURCE_TYPE_LABELS,
} from "@/lib/knowledge-categories"

export { CATEGORY_LABELS, SOURCE_TYPE_LABELS }

export const KNOWLEDGE_UPLOAD_ACCEPT = ".pdf,.txt,.md,.csv,.docx,.xls,.xlsx,.pptx,.html,.htm,.json,.xml,.rtf"

export interface KnowledgeEntry {
  id: string
  userId: string
  projectId?: string | null
  category: string
  title: string
  content: string
  tags: string[]
  sourceType: string
  valueGrade?: string | null
  status: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string }
  project?: { id: string; name: string; companyName: string | null; industry: string | null; status: string } | null
  embedding?: { status: string; updatedAt: string; errorMessage: string | null } | null
}

export interface AdminProject {
  id: string
  name: string
  companyName: string | null
  industry: string | null
  status: string
  knowledgeCount?: number
  user: { id: string; name: string | null; email: string }
}

export interface DistillResult {
  distilled: Array<{
    index: number
    suggestedTitle: string
    suggestedContent: string
    suggestedCategory: string
    tags: string[]
    action: "keep" | "merge" | "archive"
  }>
  duplicates: number[][]
  suggestions: string
}

export const JIEKOU_PROVIDER_MODELS: Record<
  string,
  Array<{ value: string; label: string; free?: boolean }>
> = {
  jiekou: [
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "deepseek-v4-flash", label: "deepseek-v4-flash" },
    { value: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
  ],
  openrouter: [
    { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6（付费）" },
    { value: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B（免费·中文强）", free: true },
    { value: "google/gemma-4-31b-it:free", label: "Gemma 4 31B（免费·质量最高）", free: true },
    { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B（免费）", free: true },
    { value: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B（免费·超大）", free: true },
    { value: "openrouter/free", label: "自动路由（免费·随机选）", free: true },
  ],
}

/**
 * @description 请求获取knowledge
 * @param params - 参数对象
 * @returns 无返回值
 */
export async function fetchKnowledge(params: {
  page?: number
  pageSize?: number
  search?: string
  category?: string
  userId?: string
  sourceType?: string
  projectId?: string
  valueGrade?: string
  status?: string
}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set("page", String(params.page))
  if (params.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params.search) qs.set("search", params.search)
  if (params.category) qs.set("category", params.category)
  if (params.userId) qs.set("userId", params.userId)
  if (params.sourceType) qs.set("sourceType", params.sourceType)
  if (params.projectId) qs.set("projectId", params.projectId)
  if (params.valueGrade) qs.set("valueGrade", params.valueGrade)
  if (params.status) qs.set("status", params.status)

  const res = await fetch(`/api/admin/knowledge?${qs}`)
  return res.json() as Promise<{
    data: { results: KnowledgeEntry[]; total: number; page: number; pageSize: number }
  }>
}

/**
 * @description 请求获取projects
 * @returns 无返回值
 */
export async function fetchProjects() {
  const res = await fetch("/api/admin/projects")
  return res.json() as Promise<{ data: AdminProject[] }>
}

/**
 * @description projectlabel
 * @param project - project
 * @returns 无返回值
 */
export function projectLabel(project: AdminProject) {
  const count = typeof project.knowledgeCount === "number" ? ` · ${project.knowledgeCount}条资料` : ""
  return `${project.name}${project.companyName ? ` · ${project.companyName}` : ""}${count}`
}

/**
 * @description embeddinglabel
 * @param entry - 条目
 * @returns 无返回值
 */
export function embeddingLabel(entry: KnowledgeEntry) {
  if (entry.embedding?.status === "completed") return "已向量化"
  if (entry.embedding?.status === "failed") return "失败"
  return "未生成"
}

/**
 * @description 批量action
 * @param ids - 标识符列表
 * @param action - 操作
 * @param value? - value?
 * @returns 无返回值
 */
export async function batchAction(ids: string[], action: string, value?: string | string[]) {
  const res = await fetch("/api/admin/knowledge", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids, action, value }),
  })
  if (!res.ok) throw new Error("操作失败")
  return res.json().catch(() => ({ success: true }))
}

/**
 * @description 删除entries
 * @param ids - 标识符列表
 * @returns 无返回值
 */
export async function deleteEntries(ids: string[]) {
  const res = await fetch(`/api/admin/knowledge?ids=${ids.join(",")}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("删除失败")
  return res.json().catch(() => ({ success: true }))
}

/**
 * @description distillentries
 * @param ids - 标识符列表
 * @returns 无返回值
 */
export async function distillEntries(ids: string[]) {
  const res = await fetch("/api/admin/knowledge/distill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error("蒸馏失败")
  return res.json() as Promise<{ data: { entryCount: number; result: DistillResult } }>
}
