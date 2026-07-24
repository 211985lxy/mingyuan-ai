import type { Dispatch, SetStateAction } from "react"
import { Loader2, Upload, X } from "lucide-react"
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
import {
  CATEGORY_LABELS,
  KNOWLEDGE_UPLOAD_ACCEPT,
  projectLabel,
  type AdminProject,
} from "@/features/knowledge/admin-knowledge-shared"

export interface KnowledgeEditForm {
  title: string
  content: string
  category: string
  tags: string
  sourceType: string
  projectId: string
  valueGrade: string
}

/**
 * @description knowledgeentrydialog
 * @param options - 配置选项
 * @returns 无返回值
 */
export function KnowledgeEntryDialog({
  open,
  form,
  projects,
  saving,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean
  form: KnowledgeEditForm
  projects: AdminProject[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: Dispatch<SetStateAction<KnowledgeEditForm>>
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>手动录入知识条目</DialogTitle>
          <DialogDescription>手动添加一条知识到知识库</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>分类</Label>
            <Select value={form.category} onValueChange={(value) => onFormChange((current) => ({ ...current, category: value ?? "" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>归属项目</Label>
            <Select value={form.projectId} onValueChange={(value) => onFormChange((current) => ({ ...current, projectId: value ?? "none" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">全局方法论 / 不绑定项目</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{projectLabel(project)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>价值分级（决定检索优先级，默认 B）</Label>
            <Select value={form.valueGrade || "none"} onValueChange={(value) => onFormChange((current) => ({ ...current, valueGrade: value === "none" ? "" : (value ?? "") }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">B · 参考级（默认）</SelectItem>
                <SelectItem value="S">S · 战略级（优先浮出）</SelectItem>
                <SelectItem value="A">A · 战术级</SelectItem>
                <SelectItem value="C">C · 索引级（靠后）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>标题</Label>
            <Input
              value={form.title}
              onChange={(event) => onFormChange((current) => ({ ...current, title: event.target.value }))}
              placeholder="知识条目标题"
            />
          </div>
          <div>
            <Label>内容</Label>
            <Textarea
              value={form.content}
              onChange={(event) => onFormChange((current) => ({ ...current, content: event.target.value }))}
              placeholder="知识条目内容"
              rows={6}
            />
          </div>
          <div>
            <Label>标签（用逗号分隔）</Label>
            <Input
              value={form.tags}
              onChange={(event) => onFormChange((current) => ({ ...current, tags: event.target.value }))}
              placeholder="标签1, 标签2"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">取消</Button>
            <Button onClick={onSave} disabled={saving || !form.title || !form.content} className="cursor-pointer">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * @description knowledgeuploaddialog
 * @param options - 配置选项
 * @returns 无返回值
 */
export function KnowledgeUploadDialog({
  open,
  file,
  category,
  projectId,
  projects,
  uploading,
  onOpenChange,
  onFileChange,
  onCategoryChange,
  onProjectChange,
  onUpload,
}: {
  open: boolean
  file: File | null
  category: string
  projectId: string
  projects: AdminProject[]
  uploading: boolean
  onOpenChange: (open: boolean) => void
  onFileChange: (file: File | null) => void
  onCategoryChange: (category: string) => void
  onProjectChange: (projectId: string) => void
  onUpload: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>上传文件导入知识</DialogTitle>
          <DialogDescription>支持 PDF、Word（.docx）、PPT、Excel、HTML、TXT、MD、CSV、JSON、XML、RTF</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>分类</Label>
            <Select value={category} onValueChange={(value) => onCategoryChange(value ?? "")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>归属项目</Label>
            <Select value={projectId} onValueChange={(value) => onProjectChange(value ?? "none")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">全局方法论 / 不绑定项目</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{projectLabel(project)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>选择文件</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="file"
                accept={KNOWLEDGE_UPLOAD_ACCEPT}
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              {file && (
                <Button variant="ghost" size="icon" onClick={() => onFileChange(null)} className="cursor-pointer">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {file && (
              <p className="text-xs text-muted-foreground mt-1">
                已选: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">取消</Button>
            <Button onClick={onUpload} disabled={uploading || !file} className="cursor-pointer">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "上传中..." : "上传并导入"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
