"use client"

import type { Dispatch, SetStateAction } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

export function CustomerKnowledgeEntryDialog({
  open,
  mode,
  form,
  projects,
  saving,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean
  mode: "create" | "edit"
  form: CustomerKnowledgeForm
  projects: ClientProject[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: Dispatch<SetStateAction<CustomerKnowledgeForm>>
  onSave: () => void
}) {
  const projectRequired = PROJECT_REQUIRED_CATEGORIES.has(form.category)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新增知识" : "编辑知识"}</DialogTitle>
          <DialogDescription>
            这些内容会在 AIM 创作时按项目调用。请写真实可用的业务资料，不要写空话。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>分类</Label>
            <Select
              value={form.category}
              onValueChange={(value) => onFormChange((current) => ({ ...current, category: value ?? current.category }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWLEDGE_CATEGORIES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {CATEGORY_LABELS[key] ?? key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>所属项目{projectRequired ? "（必选）" : ""}</Label>
            <Select
              value={form.projectId}
              onValueChange={(value) => onFormChange((current) => ({ ...current, projectId: value ?? "none" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!projectRequired ? <SelectItem value="none">全局资料</SelectItem> : null}
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>标题</Label>
            <Input
              value={form.title}
              onChange={(event) => onFormChange((current) => ({ ...current, title: event.target.value }))}
              placeholder="例如：核心产品卖点"
            />
          </div>
          <div>
            <Label>内容</Label>
            <Textarea
              value={form.content}
              onChange={(event) => onFormChange((current) => ({ ...current, content: event.target.value }))}
              placeholder="写清楚事实、案例、原话或可复用表达"
              rows={8}
            />
          </div>
          <div>
            <Label>标签（逗号分隔，可选）</Label>
            <Input
              value={form.tags}
              onChange={(event) => onFormChange((current) => ({ ...current, tags: event.target.value }))}
              placeholder="卖点, 成交, 私域"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
