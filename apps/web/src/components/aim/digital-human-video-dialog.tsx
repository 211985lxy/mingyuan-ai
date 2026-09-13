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
import {
  listPublicDigitalPersons,
  type PublicDigitalPersonList,
  type PublicDigitalPersonOption,
} from "@/lib/api/digital-human"
import { AvatarPicker, PublicPersonPicker } from "@/components/aim/digital-human-person-pickers"
import { fetchVoiceModels, type VoiceModelOption } from "@/lib/api/voice"
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
  const [avatarSource, setAvatarSource] = useState<"mine" | "public">("mine")
  const [publicPersons, setPublicPersons] = useState<PublicDigitalPersonList | null>(null)
  const [loadingPublic, setLoadingPublic] = useState(false)
  const [selectedPublic, setSelectedPublic] = useState<PublicDigitalPersonOption | null>(null)
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16")
  const [voiceSource, setVoiceSource] = useState<"tts" | "own_voice">("tts")
  const [fishVoices, setFishVoices] = useState<VoiceModelOption[]>([])
  const [loadingFishVoices, setLoadingFishVoices] = useState(false)
  const [fishVoiceId, setFishVoiceId] = useState<string>("default")
  const [script, setScript] = useState(initialScript)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<ApiVideoTask | null>(null)

  const readyAvatars = useMemo(
    () => avatars.filter((item) => item.status === "ready"),
    [avatars],
  )
  const publicVoiceId =
    selectedPublic?.defaultVoiceId
    ?? (publicPersons?.status === "ok" ? publicPersons.fallbackVoiceId : null)
  const speechSeconds = estimateSpeechSeconds(script)
  const tooLong = script.replace(/\s+/g, "").length > MAX_SCRIPT_CHARS

  useEffect(() => {
    if (!open) return
    setScript(initialScript)
    setTask(null)
    setSelectedAvatarId("")
    setAspectRatio("9:16")
    setVoiceSource("tts")
    setFishVoiceId("default")
    setAvatarSource("mine")
    setSelectedPublic(null)
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
        // 没有自建数字人时直接引导到公共数字人，避免用户卡在「先去克隆」
        else setAvatarSource("public")
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "数字人列表加载失败")
        setAvatars([])
      })
      .finally(() => setLoadingAvatars(false))
  }, [open, initialScript, projectId])

  useEffect(() => {
    if (!open || avatarSource !== "public" || publicPersons) return
    // 切到公共数字人时置加载态：与上方列表同属预期的首屏行为（仓库惯例 warn 放行）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPublic(true)
    void listPublicDigitalPersons()
      .then(setPublicPersons)
      .catch((error: unknown) =>
        setPublicPersons({
          status: "error",
          message: error instanceof Error ? error.message : "读取公共数字人失败",
        }),
      )
      .finally(() => setLoadingPublic(false))
  }, [open, avatarSource, publicPersons])

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

  useEffect(() => {
    if (!open || voiceSource !== "own_voice" || fishVoices.length > 0) return
    setLoadingFishVoices(true)
    void fetchVoiceModels("mine")
      .then((res) => setFishVoices(res.voices ?? []))
      .catch(() => {
        /* 音色列表失败不阻塞：提交时用平台默认音色 */
      })
      .finally(() => setLoadingFishVoices(false))
  }, [open, voiceSource, fishVoices.length])

  async function handleSubmit() {
    const cleaned = script.trim()
    if (!cleaned) {
      toast.error("请先确认口播文案")
      return
    }
    if (avatarSource === "public") {
      if (!selectedPublic) {
        toast.error("请选择一个公共数字人")
        return
      }
      if (!publicVoiceId) {
        toast.error("该形象暂无可用音色，请稍后重试或换一个形象")
        return
      }
    } else if (!selectedAvatarId) {
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
        // 公共数字人直接带供应商的形象与音色 id；自建数字人走 avatarId
        ...(avatarSource === "public"
          ? { virtualmanId: selectedPublic!.id, speakerId: publicVoiceId!, avatarName: selectedPublic!.name }
          : { avatarId: selectedAvatarId }),
        scriptContent: cleaned,
        aspectRatio,
        ...(voiceSource === "own_voice"
          ? { voiceSource, voiceId: fishVoiceId === "default" ? undefined : fishVoiceId }
          : {}),
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">数字人来源</p>
                {avatarSource === "mine" ? (
                  <Link href="/assets" className="text-xs text-primary underline-offset-2 hover:underline">
                    去资产库创建
                  </Link>
                ) : null}
              </div>
            </div>
            <Select
              value={avatarSource}
              onValueChange={(value) => value && setAvatarSource(value as "mine" | "public")}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">我的数字人（需先在资产库克隆）</SelectItem>
                <SelectItem value="public">公共数字人（无需克隆，可直接出片）</SelectItem>
              </SelectContent>
            </Select>
            {avatarSource === "public" ? (
              <PublicPersonPicker
                state={publicPersons}
                loading={loadingPublic}
                selectedId={selectedPublic?.id ?? ""}
                onSelect={setSelectedPublic}
              />
            ) : (
              <AvatarPicker
                avatars={readyAvatars}
                loading={loadingAvatars}
                selectedId={selectedAvatarId}
                onSelect={setSelectedAvatarId}
              />
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
            <p className="text-sm font-medium">声音来源</p>
            <Select value={voiceSource} onValueChange={(value) => value && setVoiceSource(value as "tts" | "own_voice")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tts">数字人自带音色</SelectItem>
                <SelectItem value="own_voice">我的音色（语音工坊，口型对齐）</SelectItem>
              </SelectContent>
            </Select>
            {voiceSource === "own_voice" ? (
              <div className="space-y-1.5">
                <Select value={fishVoiceId} onValueChange={(value) => value && setFishVoiceId(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">平台默认音色</SelectItem>
                    {fishVoices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>{voice.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {loadingFishVoices
                    ? "音色加载中…"
                    : fishVoices.length === 0
                      ? "暂无克隆音色，将使用平台默认音色；可在语音工坊克隆自己的声音。"
                      : "提交时会先用所选音色合成音频，再驱动数字人对口型。"}
                </p>
              </div>
            ) : null}
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
