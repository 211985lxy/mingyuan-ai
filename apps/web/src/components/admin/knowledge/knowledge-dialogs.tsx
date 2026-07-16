import { Loader2, Sparkles, Upload, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownRenderer } from "@/components/markdown-renderer"

type Option = { id: string; label: string }
type EntryForm = { category: string; title: string; content: string; tags: string; projectId: string; valueGrade: string }

export function KnowledgeDetailDialog(props: {
  entry: { title: string; content: string; category: string; sourceType: string; status: string; valueGrade?: string | null; project?: { name: string } | null; user?: { email: string } } | null
  categories: Record<string, string>
  sources: Record<string, string>
  onClose: () => void
}) {
  const entry = props.entry
  return <Dialog open={!!entry} onOpenChange={(open) => !open && props.onClose()}>
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{entry?.title ?? "知识详情"}</DialogTitle><DialogDescription>{entry?.project?.name ?? "全局/未绑定"} · {entry?.user?.email ?? "未知用户"}</DialogDescription></DialogHeader>
      {entry && <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{props.categories[entry.category] || entry.category}</Badge>
          <Badge variant="outline">{props.sources[entry.sourceType] || entry.sourceType}</Badge>
          <Badge variant={entry.status === "active" ? "default" : "secondary"}>{entry.status === "active" ? "生效" : "已归档"}</Badge>
          {entry.valueGrade && <Badge variant="outline">{entry.valueGrade}</Badge>}
        </div>
        <div className="rounded-lg border bg-muted/30 p-4"><MarkdownRenderer content={entry.content} /></div>
      </div>}
    </DialogContent>
  </Dialog>
}

export function KnowledgeDistillDialog(props: { open: boolean; loading: boolean; result: { distilled: Array<{ index: number; suggestedTitle: string; suggestedContent: string; suggestedCategory: string; tags: string[]; action: "keep" | "merge" | "archive" }>; duplicates: number[][]; suggestions: string } | null; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />知识蒸馏分析</DialogTitle><DialogDescription>基于 DeepSeek 对选中知识的优化建议</DialogDescription></DialogHeader>
    {props.loading ? <div className="flex flex-col items-center justify-center gap-3 py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">正在分析知识条目...</p></div>
      : props.result ? <div className="space-y-6">
        <div><h3 className="mb-3 font-semibold">精炼建议</h3><div className="space-y-3">{props.result.distilled.map((item) => <Card key={item.index}><CardContent className="space-y-2 p-4"><div className="flex items-center justify-between"><Badge variant={item.action === "keep" ? "default" : item.action === "merge" ? "secondary" : "outline"}>{item.action === "keep" ? "保留" : item.action === "merge" ? "合并" : "归档"}</Badge><Badge variant="outline">{item.suggestedCategory}</Badge></div><p className="font-medium">{item.suggestedTitle}</p><p className="text-sm text-muted-foreground">{item.suggestedContent}</p><div className="flex flex-wrap gap-1">{item.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}</div></CardContent></Card>)}</div></div>
        {props.result.duplicates.length > 0 && <div><h3 className="mb-2 font-semibold">可能的重复条目</h3>{props.result.duplicates.map((pair) => <p key={pair.join("-")} className="text-sm text-muted-foreground">条目 #{pair[0]} 和 #{pair[1]} 可能重复</p>)}</div>}
        <div><h3 className="mb-2 font-semibold">优化建议</h3><p className="text-sm leading-relaxed text-muted-foreground">{props.result.suggestions}</p></div>
      </div> : <p className="text-sm text-destructive">分析失败，请重试</p>}
  </DialogContent></Dialog>
}

function EntrySelects(props: { form: EntryForm; categories: Record<string, string>; projects: Option[]; onChange: (patch: Partial<EntryForm>) => void }) {
  return <>
    <div><Label>分类</Label><Select value={props.form.category} onValueChange={(value) => props.onChange({ category: value ?? "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(props.categories).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>归属项目</Label><Select value={props.form.projectId} onValueChange={(value) => props.onChange({ projectId: value ?? "none" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">全局方法论 / 不绑定项目</SelectItem>{props.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>价值分级（决定检索优先级，默认 B）</Label><Select value={props.form.valueGrade || "none"} onValueChange={(value) => props.onChange({ valueGrade: value === "none" ? "" : value ?? "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">B · 参考级（默认）</SelectItem><SelectItem value="S">S · 战略级（优先浮出）</SelectItem><SelectItem value="A">A · 战术级</SelectItem><SelectItem value="C">C · 索引级（靠后）</SelectItem></SelectContent></Select></div>
  </>
}

export function KnowledgeAddDialog(props: { open: boolean; form: EntryForm; saving: boolean; categories: Record<string, string>; projects: Option[]; onOpenChange: (open: boolean) => void; onChange: (patch: Partial<EntryForm>) => void; onSave: () => void }) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>手动录入知识条目</DialogTitle><DialogDescription>手动添加一条知识到知识库</DialogDescription></DialogHeader><div className="space-y-4">
    <EntrySelects form={props.form} categories={props.categories} projects={props.projects} onChange={props.onChange} />
    <div><Label>标题</Label><Input value={props.form.title} onChange={(event) => props.onChange({ title: event.target.value })} placeholder="知识条目标题" /></div>
    <div><Label>内容</Label><Textarea value={props.form.content} onChange={(event) => props.onChange({ content: event.target.value })} placeholder="知识条目内容" rows={6} /></div>
    <div><Label>标签（用逗号分隔）</Label><Input value={props.form.tags} onChange={(event) => props.onChange({ tags: event.target.value })} placeholder="标签1, 标签2" /></div>
    <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button><Button onClick={props.onSave} disabled={props.saving || !props.form.title || !props.form.content}>{props.saving && <Loader2 className="h-4 w-4 animate-spin" />}保存</Button></div>
  </div></DialogContent></Dialog>
}

export function KnowledgeUploadDialog(props: { open: boolean; file: File | null; category: string; projectId: string; uploading: boolean; categories: Record<string, string>; projects: Option[]; onOpenChange: (open: boolean) => void; onFileChange: (file: File | null) => void; onCategoryChange: (category: string) => void; onProjectChange: (projectId: string) => void; onUpload: () => void }) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>上传文件导入知识</DialogTitle><DialogDescription>支持 PDF、Word、PPT、Excel、HTML、TXT、MD、CSV、JSON、XML、RTF</DialogDescription></DialogHeader><div className="space-y-4">
    <div><Label>分类</Label><Select value={props.category} onValueChange={(value) => props.onCategoryChange(value ?? "")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(props.categories).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>归属项目</Label><Select value={props.projectId} onValueChange={(value) => props.onProjectChange(value ?? "none")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">全局方法论 / 不绑定项目</SelectItem>{props.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>选择文件</Label><div className="mt-1 flex items-center gap-2"><Input type="file" accept=".pdf,.txt,.md,.csv,.docx,.xls,.xlsx,.pptx,.html,.htm,.json,.xml,.rtf" onChange={(event) => props.onFileChange(event.target.files?.[0] ?? null)} />{props.file && <Button variant="ghost" size="icon" onClick={() => props.onFileChange(null)}><X className="h-4 w-4" /></Button>}</div>{props.file && <p className="mt-1 text-xs text-muted-foreground">已选: {props.file.name} ({(props.file.size / 1024).toFixed(1)} KB)</p>}</div>
    <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button><Button onClick={props.onUpload} disabled={props.uploading || !props.file}>{props.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{props.uploading ? "上传中..." : "上传并导入"}</Button></div>
  </div></DialogContent></Dialog>
}
