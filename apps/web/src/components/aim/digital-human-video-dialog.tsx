"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { createVideoTask, getVideoTask, listAvatars } from "@/lib/api/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ApiAvatar, ApiVideoTask } from "@/types/api"

const MAX_SCRIPT_CHARS = 2500
const POLL_MS = 4000
const TASK_STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  pending: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
}

function estimateSpeechSeconds(text: string): number {
  // Rough Chinese spoken pace ~4 chars/sec
  return Math.max(8, Math.round(text.replace(/\s+/g, "").length / 4))
}

export function DigitalHumanVideoDialog({
  open,
  onOpenChange,
  initialScript,
  projectId,
  aimGenerationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialScript: string
  projectId?: string | null
  aimGenerationId?: string | null
}) {
  const [avatars, setAvatars] = useState<ApiAvatar[]>([])
  const [loadingAvatars, setLoadingAvatars] = useState(false)
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("")
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16")
  const [script, setScript] = useState(initialScript)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<ApiVideoTask | null>(null)

  const readyAvatars = useMemo(
    () => avatars.filter((item) => item.status === "ready"),
    [avatars],
  )
  const speechSeconds = estimateSpeechSeconds(script)
  const tooLong = script.replace(/\s+/g, "").length > MAX_SCRIPT_CHARS

  useEffect(() => {
    if (!open) return
    setScript(initialScript)
    setTask(null)
    setSelectedAvatarId("")
    setAspectRatio("9:16")
    if (!projectId) {
      setAvatars([])
      setLoadingAvatars(false)
      return
    }
    setLoadingAvatars(true)
    void listAvatars(projectId)
      .then((rows) => {
        setAvatars(rows)
        const firstReady = rows.find((item) => item.status === "ready")
        if (firstReady) setSelectedAvatarId(firstReady.id)
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "数字人列表加载失败")
        setAvatars([])
      })
      .finally(() => setLoadingAvatars(false))
  }, [open, initialScript, projectId])

  useEffect(() => {
    if (!task || !["pending", "processing"].includes(task.status)) return
    const timer = window.setInterval(() => {
      void getVideoTask(task.id)
        .then((next) => setTask(next))
        .catch(() => {
          /* keep polling; surface final failure from task itself */
        })
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [task])

  async function handleSubmit() {
    const cleaned = script.trim()
    if (!cleaned) {
      toast.error("请先确认口播文案")
      return
    }
    if (!selectedAvatarId) {
      toast.error("请选择一个可用数字人")
      return
    }
    if (!projectId) {
      toast.error("请先选择一个客户项目")
      return
    }
    if (tooLong) {
      toast.error(`文案偏长（建议不超过 ${MAX_SCRIPT_CHARS} 字），请先精简后再生成`)
      return
    }

    setSubmitting(true)
    try {
      const created = await createVideoTask({
        type: "virtualman_broadcast",
        projectId,
        aimGenerationId: aimGenerationId ?? undefined,
        avatarId: selectedAvatarId,
        scriptContent: cleaned,
        aspectRatio,
      })
      setTask(created)
      toast.success("已提交生成，成片会自动刷新状态")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>用数字人生成视频</DialogTitle>
          <DialogDescription>
            选择已就绪的数字人，确认口播文案后提交。生成通常需要几十秒到几分钟。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!projectId ? (
            <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
              这份稿件尚未绑定客户项目，暂不能生成项目视频。请先回到 AIM 选择一个项目。
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">选择数字人</p>
              <Link href="/assets" className="text-xs text-primary underline-offset-2 hover:underline">
                去资产库创建
              </Link>
            </div>
            {loadingAvatars ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : readyAvatars.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                还没有可用数字人。请先到资产库完成克隆（状态为「可用」）。
              </div>
            ) : (
              <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                {readyAvatars.map((avatar) => {
                  const selected = avatar.id === selectedAvatarId
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(avatar.id)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/40"
                      }`}
                    >
                      <p className="font-medium">{avatar.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {avatar.speakerName || "已绑定声音"}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">画面比例</p>
            <Select value={aspectRatio} onValueChange={(value) => value && setAspectRatio(value as "9:16" | "16:9")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="9:16">9:16 竖屏（1080×1920）</SelectItem>
                <SelectItem value="16:9">16:9 横屏（1920×1080）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">口播文案</p>
              <span className="text-xs text-muted-foreground">
                约 {speechSeconds}s · {script.replace(/\s+/g, "").length} 字
              </span>
            </div>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              className="resize-y"
              placeholder="粘贴或编辑要让数字人念的口播正文…"
            />
            {tooLong ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                文案偏长，建议先去内容创作压成可拍摄口播，再回来生成。
              </p>
            ) : null}
          </div>

          {task ? (
            <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">任务状态</span>
                <Badge variant="secondary">{TASK_STATUS_LABEL[task.status] ?? task.status}</Badge>
              </div>
              {["pending", "processing"].includes(task.status) ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  生成中，页面会自动刷新…
                </p>
              ) : null}
              {task.status === "failed" ? (
                <p className="text-destructive">
                  {task.errorMessage || "生成失败，请稍后重试或更换数字人"}
                </p>
              ) : null}
              {task.status === "completed" && task.videoUrl ? (
                <div className="space-y-2">
                  <p className="text-foreground">成片已就绪。</p>
                  <Button size="sm" onClick={() => window.open(task.videoUrl!, "_blank", "noopener,noreferrer")}>
                    打开成片
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <Button
            className="w-full"
            disabled={!projectId || submitting || loadingAvatars || readyAvatars.length === 0 || Boolean(task)}
            onClick={() => void handleSubmit()}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {task ? (task.status === "completed" ? "已生成" : "任务已提交") : "提交生成"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
