"use client"

import type { RefObject } from "react"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CustomerSmartImportDropzone } from "@/features/knowledge/components/customer-smart-import-dropzone"
import type { CustomerSmartImportProject } from "@/features/knowledge/components/customer-smart-import-types"

/** 上传步：拖拽区 + 归属全案 */
export function CustomerSmartImportUploadStep(props: {
  projectId: string
  projectOptions: CustomerSmartImportProject[]
  files: File[]
  dragOver: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onProjectChange: (projectId: string) => void
  onAddFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
  onDragOverChange: (over: boolean) => void
  onAnalyze: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>归属全案</Label>
        <Select value={props.projectId || undefined} onValueChange={(value) => props.onProjectChange(value ?? "")}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="选择全案" /></SelectTrigger>
          <SelectContent>
            {props.projectOptions.map((project) => (
              <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CustomerSmartImportDropzone
        dragOver={props.dragOver}
        fileInputRef={props.fileInputRef}
        onDragOverChange={props.onDragOverChange}
        onAddFiles={props.onAddFiles}
      />

      {props.files.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">已选 {props.files.length} 个文件：</p>
          <div className="flex flex-wrap gap-2">
            {props.files.map((file, index) => (
              <Badge key={`${file.name}-${index}`} variant="secondary" className="text-xs">
                {file.name} ({(file.size / 1024).toFixed(1)}KB)
                <button
                  type="button"
                  className="ml-1 hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onRemoveFile(index)
                  }}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={props.onCancel}>取消</Button>
        <Button onClick={props.onAnalyze} disabled={props.files.length === 0 || !props.projectId}>
          <Sparkles className="mr-1 h-4 w-4" />
          开始清洗
        </Button>
      </div>
    </div>
  )
}
