"use client"

import { Loader2, Sparkles } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CustomerSmartImportPreviewStep } from "@/features/knowledge/components/customer-smart-import-preview-step"
import { CustomerSmartImportUploadStep } from "@/features/knowledge/components/customer-smart-import-upload-step"
import { useCustomerSmartImportDialog } from "@/features/knowledge/hooks/use-customer-smart-import-dialog"
import type { ClientProject } from "@/lib/api/projects"

export { CustomerSmartImportUploadStep } from "@/features/knowledge/components/customer-smart-import-upload-step"

/** 客户侧知识库：拖拽/点选 → 清洗预览 → 确认入库 */
export function CustomerSmartImportDialog(props: {
  open: boolean
  projects: ClientProject[]
  defaultProjectId?: string
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const s = useCustomerSmartImportDialog(props)

  return (
    <Dialog open={props.open} onOpenChange={s.handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            拖文件入库
          </DialogTitle>
          <DialogDescription>
            支持 PDF / Word / PPT / Excel / TXT / MD 等。系统会先清洗分类，你确认后再写入知识库。
          </DialogDescription>
        </DialogHeader>

        {s.step === "upload" && (
          <CustomerSmartImportUploadStep
            projectId={s.projectId}
            projectOptions={s.projectOptions}
            files={s.files}
            dragOver={s.dragOver}
            fileInputRef={s.fileInputRef}
            onProjectChange={s.setProjectId}
            onAddFiles={s.addFiles}
            onRemoveFile={(index) => s.setFiles((current) => current.filter((_, i) => i !== index))}
            onDragOverChange={s.setDragOver}
            onAnalyze={() => void s.analyze()}
            onCancel={() => s.handleOpenChange(false)}
          />
        )}

        {s.step === "processing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在清洗并分类文件内容…</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              {s.files.map((file) => <p key={file.name}>{file.name}</p>)}
            </div>
          </div>
        )}

        {s.step === "preview" && s.previewData && (
          <CustomerSmartImportPreviewStep
            processed={s.processed}
            edits={s.edits}
            expanded={s.expanded}
            confirming={s.confirming}
            onEdit={(index, patch) =>
              s.setEdits((current) => ({ ...current, [index]: { ...current[index], ...patch } }))
            }
            onToggleExpand={(index) =>
              s.setExpanded((current) => {
                const next = new Set(current)
                if (next.has(index)) next.delete(index)
                else next.add(index)
                return next
              })
            }
            onBack={() => s.setStep("upload")}
            onConfirm={() => void s.confirm()}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
