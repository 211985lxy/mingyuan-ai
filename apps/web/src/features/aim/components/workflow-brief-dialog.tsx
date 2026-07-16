import type { Dispatch, SetStateAction } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ConfirmedWorkflowBrief } from "@/lib/aim-workflow"

interface WorkflowBriefDialogProps {
  open: boolean
  busy: boolean
  form: ConfirmedWorkflowBrief
  setForm: Dispatch<SetStateAction<ConfirmedWorkflowBrief>>
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export function WorkflowBriefDialog({
  open,
  busy,
  form,
  setForm,
  onOpenChange,
  onCancel,
  onConfirm,
}: WorkflowBriefDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>确认内容任务单</DialogTitle>
          <DialogDescription>项目事实和上游结果已带入。这里可以改目标和约束，确认后再交给内容生产官。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">内容目标</p>
            <Input value={form.goal || ""} onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">目标客户</p>
              <Input value={form.targetCustomer || ""} onChange={(event) => setForm((prev) => ({ ...prev, targetCustomer: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">承接动作</p>
              <Input
                value={form.desiredAction || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, desiredAction: event.target.value as ConfirmedWorkflowBrief["desiredAction"] }))}
                placeholder="如：私信、预约诊断"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">核心问题</p>
            <Textarea value={form.realProblem || ""} onChange={(event) => setForm((prev) => ({ ...prev, realProblem: event.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">必须保留项</p>
            <Textarea value={form.mustKeep || ""} onChange={(event) => setForm((prev) => ({ ...prev, mustKeep: event.target.value }))} placeholder="案例、原话、关键结论等" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">禁区</p>
            <Textarea value={form.avoid || ""} onChange={(event) => setForm((prev) => ({ ...prev, avoid: event.target.value }))} placeholder="不能说的承诺、敏感词或表达" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">用户补充</p>
            <Textarea value={form.userSupplement || ""} onChange={(event) => setForm((prev) => ({ ...prev, userSupplement: event.target.value }))} placeholder="会标记为用户补充，不会伪装成项目事实" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button disabled={busy} onClick={onConfirm}>进入内容创作</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
