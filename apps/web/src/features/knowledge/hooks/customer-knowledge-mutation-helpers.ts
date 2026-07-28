import { toast } from "sonner"
import {
  ApiError,
  archiveKnowledge,
  createKnowledge,
  updateKnowledge,
  type KnowledgeEntry,
} from "@/lib/api/client"
import { PROJECT_REQUIRED_CATEGORIES } from "@/lib/knowledge-categories"
import {
  parseCustomerKnowledgeTags,
  type CustomerKnowledgeForm,
} from "@/features/knowledge/components/customer-knowledge-form"

export async function saveCustomerKnowledgeEntry(input: {
  mode: "create" | "edit"
  editingId: string | null
  form: CustomerKnowledgeForm
  reload: () => Promise<void>
  onSuccess: () => void
}) {
  const title = input.form.title.trim()
  const content = input.form.content.trim()
  if (!title || !content) {
    toast.error("请填写标题和内容")
    return
  }
  if (PROJECT_REQUIRED_CATEGORIES.has(input.form.category) && input.form.projectId === "none") {
    toast.error("这个分类需要选择所属项目")
    return
  }

  const payload = {
    title,
    content,
    category: input.form.category,
    tags: parseCustomerKnowledgeTags(input.form.tags),
    projectId: input.form.projectId === "none" ? null : input.form.projectId,
  }

  try {
    if (input.mode === "create") {
      await createKnowledge({ ...payload, projectId: payload.projectId ?? undefined, sourceType: "manual" })
      toast.success("已新增知识")
    } else if (input.editingId) {
      await updateKnowledge(input.editingId, payload)
      toast.success("已更新知识")
    }
    input.onSuccess()
    await input.reload()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return
    toast.error(error instanceof Error ? error.message : "保存失败，请检查后重试")
  }
}

export async function archiveCustomerKnowledgeEntry(input: {
  entry: KnowledgeEntry
  reload: () => Promise<void>
}) {
  if (input.entry.status === "archived") return
  if (!window.confirm(`确认归档「${input.entry.title}」？归档后默认列表不再显示，不是永久删除。`)) {
    return
  }
  try {
    await archiveKnowledge(input.entry.id)
    toast.success("已归档")
    await input.reload()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return
    toast.error(error instanceof Error ? error.message : "归档失败，请稍后重试")
  }
}
