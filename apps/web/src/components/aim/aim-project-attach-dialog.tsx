"use client"

import { FolderPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ClientProject } from "@/lib/api/client"
import type { AimProjectAttachMode } from "@/hooks/use-aim-project-attach"

/**
 * @description aimprojectattachdialog
 * @param props - 组件属性
 * @returns 无返回值
 */
export function AimProjectAttachDialog(props: {
  open: boolean
  projects: ClientProject[]
  mode: AimProjectAttachMode
  projectId: string
  projectName: string
  busy: boolean
  onModeChange: (mode: AimProjectAttachMode) => void
  onProjectIdChange: (id: string) => void
  onProjectNameChange: (name: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存到客户全案</DialogTitle>
          <DialogDescription>保存后，这份内容会继续使用该客户的资料、选题和复盘规则。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {props.projects.length ? (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={props.mode === "existing" ? "default" : "outline"} onClick={() => props.onModeChange("existing")}>选择已有全案</Button>
              <Button type="button" variant={props.mode === "new" ? "default" : "outline"} onClick={() => props.onModeChange("new")}>新建全案</Button>
            </div>
          ) : null}
          {props.mode === "existing" && props.projects.length ? (
            <select value={props.projectId} onChange={(event) => props.onProjectIdChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          ) : (
            <Input value={props.projectName} onChange={(event) => props.onProjectNameChange(event.target.value)} placeholder="例如：某机械厂老板 IP" autoFocus />
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose} disabled={props.busy}>取消</Button>
          <Button type="button" onClick={props.onSubmit} disabled={props.busy}>
            <FolderPlus className="h-4 w-4" />{props.busy ? "保存中..." : "保存到全案"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
