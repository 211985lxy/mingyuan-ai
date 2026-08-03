"use client"

import type { RefObject } from "react"
import { Upload } from "lucide-react"
import { KNOWLEDGE_UPLOAD_ACCEPT } from "@/features/knowledge/admin-knowledge-shared"
import { cn } from "@/lib/utils"

export function CustomerSmartImportDropzone(props: {
  dragOver: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onDragOverChange: (over: boolean) => void
  onAddFiles: (files: File[]) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          props.fileInputRef.current?.click()
        }
      }}
      onClick={() => props.fileInputRef.current?.click()}
      onDragEnter={(event) => {
        event.preventDefault()
        props.onDragOverChange(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        props.onDragOverChange(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        props.onDragOverChange(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        props.onDragOverChange(false)
        props.onAddFiles(Array.from(event.dataTransfer.files ?? []))
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center transition-colors",
        props.dragOver
          ? "border-primary bg-primary/5 text-primary"
          : "border-border/70 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <Upload className="h-7 w-7" />
      <p className="text-sm font-medium text-foreground">把文件拖到这里，或点击选择</p>
      <p className="text-xs">可多选 · PDF / Word / PPT / Excel / TXT / MD 等</p>
      <input
        ref={props.fileInputRef}
        type="file"
        accept={KNOWLEDGE_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          props.onAddFiles(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
    </div>
  )
}
