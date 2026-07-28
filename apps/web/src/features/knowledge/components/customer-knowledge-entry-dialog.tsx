"use client"

import type { Dispatch, SetStateAction } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ClientProject } from "@/lib/api/projects"
import { CustomerKnowledgeEntryFormFields } from "@/features/knowledge/components/customer-knowledge-entry-form-fields"
import {
  EMPTY_CUSTOMER_KNOWLEDGE_FORM,
  type CustomerKnowledgeForm,
} from "@/features/knowledge/components/customer-knowledge-form"

export { EMPTY_CUSTOMER_KNOWLEDGE_FORM }
export type { CustomerKnowledgeForm }

export function CustomerKnowledgeEntryDialog(props: {
  open: boolean
  mode: "create" | "edit"
  form: CustomerKnowledgeForm
  projects: ClientProject[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: Dispatch<SetStateAction<CustomerKnowledgeForm>>
  onSave: () => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "新增知识" : "编辑知识"}</DialogTitle>
          <DialogDescription>这些内容会在 AIM 创作时按项目调用。请写真实可用的业务资料，不要写空话。</DialogDescription>
        </DialogHeader>
        <CustomerKnowledgeEntryFormFields form={props.form} projects={props.projects} onFormChange={props.onFormChange} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.saving}>取消</Button>
          <Button onClick={props.onSave} disabled={props.saving}>
            {props.saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
