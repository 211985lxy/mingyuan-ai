"use client"

import { Mic } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MeetingMinutesWorkspace } from "@/features/meeting-minutes/components/meeting-minutes-workspace"

/** 知识库入库：会议录制转写弹层 */
export function MeetingMinutesImportDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            会议转写
          </DialogTitle>
          <DialogDescription>
            上传腾讯会议本地录制，自动转写并生成飞书纪要与结构化洞察。
          </DialogDescription>
        </DialogHeader>
        <MeetingMinutesWorkspace variant="embedded" />
      </DialogContent>
    </Dialog>
  )
}
