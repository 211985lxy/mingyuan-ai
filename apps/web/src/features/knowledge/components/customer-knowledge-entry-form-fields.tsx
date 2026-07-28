"use client"

import type { Dispatch, SetStateAction } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CATEGORY_LABELS, KNOWLEDGE_CATEGORIES, PROJECT_REQUIRED_CATEGORIES } from "@/lib/knowledge-categories"
import type { ClientProject } from "@/lib/api/projects"
import type { CustomerKnowledgeForm } from "@/features/knowledge/components/customer-knowledge-form"

export function CustomerKnowledgeEntryFormFields({
  form,
  projects,
  onFormChange,
}: {
  form: CustomerKnowledgeForm
  projects: ClientProject[]
  onFormChange: Dispatch<SetStateAction<CustomerKnowledgeForm>>
}) {
  const projectRequired = PROJECT_REQUIRED_CATEGORIES.has(form.category)
  return (
    <div className="space-y-4">
      <div>
        <Label>分类</Label>
        <Select value={form.category} onValueChange={(value) => onFormChange((c) => ({ ...c, category: value ?? c.category }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {KNOWLEDGE_CATEGORIES.map((key) => (
              <SelectItem key={key} value={key}>{CATEGORY_LABELS[key] ?? key}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>所属项目{projectRequired ? "（必选）" : ""}</Label>
        <Select value={form.projectId} onValueChange={(value) => onFormChange((c) => ({ ...c, projectId: value ?? "none" }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {!projectRequired ? <SelectItem value="none">全局资料</SelectItem> : null}
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>标题</Label>
        <Input value={form.title} onChange={(e) => onFormChange((c) => ({ ...c, title: e.target.value }))} placeholder="例如：核心产品卖点" />
      </div>
      <div>
        <Label>内容</Label>
        <Textarea value={form.content} onChange={(e) => onFormChange((c) => ({ ...c, content: e.target.value }))} placeholder="写清楚事实、案例、原话或可复用表达" rows={8} />
      </div>
      <div>
        <Label>标签（逗号分隔，可选）</Label>
        <Input value={form.tags} onChange={(e) => onFormChange((c) => ({ ...c, tags: e.target.value }))} placeholder="卖点, 成交, 私域" />
      </div>
    </div>
  )
}
