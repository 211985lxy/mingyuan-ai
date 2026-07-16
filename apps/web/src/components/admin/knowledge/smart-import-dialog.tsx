"use client"

import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SmartImportPreviewItem } from "./smart-import-preview-item"
import type { SmartImportProjectOption } from "./smart-import-types"
import { SmartImportUploadStep } from "./smart-import-upload-step"
import { useSmartImport } from "./use-smart-import"

function ProcessingStep({ files }: { files: File[] }) {
  return <div className="flex flex-col items-center justify-center gap-4 py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <p className="text-sm text-muted-foreground">正在智能分析文件内容…</p>
    <div className="space-y-1 text-xs text-muted-foreground">{files.map((file) => <p key={file.name}>{file.name}</p>)}</div>
  </div>
}

export function SmartImportDialog(props: {
  open: boolean
  defaultProjectId: string
  projects: SmartImportProjectOption[]
  categories: Record<string, string>
  getToken: () => string
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const state = useSmartImport({
    defaultProjectId: props.defaultProjectId,
    getToken: props.getToken,
    onImported: props.onImported,
    onClose: () => props.onOpenChange(false),
  })
  const handleOpenChange = (open: boolean) => {
    if (!open) state.reset()
    props.onOpenChange(open)
  }
  const items = state.preview?.processed ?? []
  const importCount = items.filter((item) => !state.edits[item.index]?.skip).length

  return <Dialog open={props.open} onOpenChange={handleOpenChange}>
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />智能导入</DialogTitle>
        <DialogDescription>上传文件，系统自动分类、打标签、去重</DialogDescription>
      </DialogHeader>
      {state.step === "upload" && <SmartImportUploadStep files={state.files} projectId={state.projectId} projects={props.projects}
        onFilesChange={state.setFiles} onProjectChange={state.setProjectId} onAnalyze={state.analyze} onCancel={() => handleOpenChange(false)} />}
      {state.step === "processing" && <ProcessingStep files={state.files} />}
      {state.step === "preview" && state.preview && <div className="space-y-4">
        <p className="text-sm text-muted-foreground">共 {items.length} 条知识待确认，可编辑标题/分类/分级，勾选跳过重复条目</p>
        <div className="space-y-3">{items.map((item) => <SmartImportPreviewItem key={item.index} item={item}
          edit={state.edits[item.index] ?? {}} expanded={state.expanded.has(item.index)} categories={props.categories}
          onEdit={(patch) => state.updateEdit(item.index, patch)} onToggleExpanded={() => state.toggleExpanded(item.index)} />)}</div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">将导入 {importCount} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => state.setStep("upload")} className="cursor-pointer">重新选择</Button>
            <Button onClick={state.confirm} disabled={state.confirming || importCount === 0} className="cursor-pointer">
              {state.confirming && <Loader2 className="h-4 w-4 animate-spin" />}确认导入
            </Button>
          </div>
        </div>
      </div>}
    </DialogContent>
  </Dialog>
}
