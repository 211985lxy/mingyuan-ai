import type { Dispatch, DragEvent, RefObject, SetStateAction } from "react"
import { FileText, Loader2, Plus, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectSelector } from "@/features/benchmark-profiles/components/project-selector"
import { PLATFORM_LABELS, type BenchmarkProfileForm, type ImportedFile } from "@/features/benchmark-profiles/model"
import { cn } from "@/lib/utils"

export function CreateProfileDialog({
  open,
  mode,
  form,
  creating,
  error,
  duplicateNotice,
  importingFiles,
  isDraggingFile,
  importedFiles,
  fileInputRef,
  onOpenChange,
  onModeChange,
  setForm,
  onCreate,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileUpload,
  onPickFile,
  onRemoveFile,
}: {
  open: boolean
  mode: "account" | "note"
  form: BenchmarkProfileForm
  creating: boolean
  error: string | null
  duplicateNotice: string | null
  importingFiles: boolean
  isDraggingFile: boolean
  importedFiles: ImportedFile[]
  fileInputRef: RefObject<HTMLInputElement | null>
  onOpenChange: (open: boolean) => void
  onModeChange: (mode: "account" | "note") => void
  setForm: Dispatch<SetStateAction<BenchmarkProfileForm>>
  onCreate: () => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onFileUpload: (files: FileList | null) => void
  onPickFile: () => void
  onRemoveFile: (index: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-md gap-5 rounded-xl bg-background p-5 transition-colors", isDraggingFile && "border-primary bg-primary/5")} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <DialogHeader>
          <DialogTitle>添加档案</DialogTitle>
          <DialogDescription className="leading-6">{mode === "account" ? "录入真实账号信息，后续可通过「一键拉取」导入账号分析。" : "粘贴聊天记录、客户资料或 Markdown 文档，保存后进入该项目的 AIM 检索。"}</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => onModeChange(value as "account" | "note")}><TabsList className="w-full"><TabsTrigger value="note" className="flex-1">客户资料</TabsTrigger><TabsTrigger value="account" className="flex-1">真实账号</TabsTrigger></TabsList></Tabs>
        <div className="space-y-4">
          <div className="space-y-2"><Label>归属项目 *</Label><ProjectSelector value={form.projectId} onChange={(projectId) => setForm((current) => ({ ...current, projectId }))} /></div>
          <div className="space-y-2"><Label>{mode === "account" ? "账号名称 *" : "名称 *"}</Label><Input className="h-10 focus-visible:border-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/10" value={form.accountName} onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))} placeholder={mode === "account" ? "如：某知识付费 IP" : "如：张总 / 某客户名"} /></div>
          {mode === "account" ? (
            <>
              <div className="space-y-2"><Label>平台 *</Label><Select value={form.platform} onValueChange={(platform) => setForm((current) => ({ ...current, platform: platform ?? "" }))}><SelectTrigger className="h-10"><SelectValue placeholder="选择平台" /></SelectTrigger><SelectContent>{Object.entries(PLATFORM_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>主页链接</Label><Input className="h-10" value={form.accountUrl} onChange={(event) => setForm((current) => ({ ...current, accountUrl: event.target.value }))} placeholder="https://..." /></div>
              <div className="space-y-2"><Label>粉丝数</Label><Input className="h-10" type="number" value={form.followerCount} onChange={(event) => setForm((current) => ({ ...current, followerCount: event.target.value }))} placeholder="如：120000" /></div>
            </>
          ) : (
            <>
              <div className="space-y-2"><Label>聊天框 / 文字资料</Label><textarea className="min-h-40 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/10" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="把微信聊天记录、客户问答、Markdown 文档内容直接粘贴到这里..." /></div>
              <div className="space-y-2">
                <Label>上传文字文件</Label>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,.pdf,.docx,.xlsx,.csv" multiple className="hidden" onChange={(event) => onFileUpload(event.target.files)} />
                <button type="button" className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors", isDraggingFile ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/40 hover:border-primary/50 hover:bg-muted/60", importingFiles ? "cursor-wait opacity-70" : "cursor-pointer")} onClick={onPickFile} disabled={importingFiles}>
                  {importingFiles ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}<span className="text-sm font-medium">{importingFiles ? "正在解析文件" : "点击选择，或直接拖进这个弹窗"}</span><span className="text-xs text-muted-foreground">.txt / .md / .pdf / .docx / .xlsx / .csv</span>
                </button>
                {importedFiles.length > 0 ? <div className="space-y-2">{importedFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onRemoveFile(index)} aria-label={`移除 ${file.name}`}><X className="h-4 w-4" /></button></div>)}</div> : null}
              </div>
            </>
          )}
          <div className="space-y-2"><Label>备注（可选）</Label><Input className="h-10" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="内部备注..." /></div>
          {duplicateNotice ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-600">{duplicateNotice}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="-mx-5 -mb-5 rounded-b-xl bg-transparent px-5 py-4"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>取消</Button><Button onClick={onCreate} disabled={creating || importingFiles}>{creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />创建中</> : <><Plus className="mr-2 h-4 w-4" />创建</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
