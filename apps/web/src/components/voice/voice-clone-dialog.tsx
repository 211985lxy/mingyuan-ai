"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Mic, Paperclip, Square, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/** 录音状态机：麦克风采集、计时、产出音频 blob；关闭对话框自动释放麦克风。 */
function useVoiceCloneRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [audio, setAudio] = useState<{ blob: Blob; filename: string } | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    window.clearInterval(timerRef.current)
    setRecording(false)
  }

  function stopRecording(discard: boolean) {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    releaseStream()
    if (discard) {
      setAudio(null)
      setSeconds(0)
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
        setAudio({ blob, filename: `my-voice-${Date.now()}.webm` })
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      setSeconds(0)
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限，或改用上传音频文件")
    }
  }

  useEffect(() => releaseStream, [])

  return { audio, recording, seconds, setAudio, startRecording, stopRecording }
}

/** 「克隆我的声音」入口按钮 + 录音/上传对话框。成功后回调刷新「我的音色」列表。 */
export function VoiceCloneButton({ onCloned, disabled }: { onCloned: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Wand2 className="h-3.5 w-3.5" />
        克隆我的声音
      </Button>
      <VoiceCloneDialog
        open={open}
        onOpenChange={setOpen}
        onCloned={() => {
          onCloned()
          setOpen(false)
        }}
      />
    </>
  )
}

function VoiceCloneDialog({ open, onOpenChange, onCloned }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloned: () => void
}) {
  const [name, setName] = useState("我的音色")
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorder = useVoiceCloneRecorder()

  function handleClose(next: boolean) {
    if (!next) recorder.stopRecording(true)
    onOpenChange(next)
  }

  async function submit() {
    if (!recorder.audio) return toast.error("请先录制或上传一段音频")
    if (!consent) return toast.error("请先确认声音授权")
    setSubmitting(true)
    try {
      const form = new FormData()
      form.set("title", name.trim() || "我的音色")
      form.set("consent", "true")
      form.append("file", recorder.audio.blob, recorder.audio.filename)
      const response = await fetch("/api/voice/clone", { method: "POST", body: form })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? "克隆提交失败")
      toast.success("克隆已提交！训练通常需要几分钟，完成后会出现在「我的音色」里")
      recorder.setAudio(null)
      onCloned()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "克隆提交失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>克隆我的声音</DialogTitle>
          <DialogDescription>
            录 10–60 秒安静环境的正常语速朗读（别太安静也别太吵）。提交后 Fish Audio 异步训练，几分钟内可用。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">音色名称</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </div>
          <RecordControls recorder={recorder} />
          <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5"
            />
            我确认这是本人声音，或已获得声音所有者的明确授权。
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleClose(false)}>取消</Button>
            <Button
              type="button"
              size="sm"
              disabled={submitting || !recorder.audio || !consent}
              onClick={() => void submit()}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {submitting ? "提交中" : "提交克隆"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RecordControls({ recorder }: {
  recorder: ReturnType<typeof useVoiceCloneRecorder>
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {recorder.recording ? (
          <Button type="button" variant="destructive" size="sm" className="h-8 gap-1" onClick={() => recorder.stopRecording(false)}>
            <Square className="h-3.5 w-3.5" /> 停止录音（{recorder.seconds}s）
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => void recorder.startRecording()}>
            <Mic className="h-3.5 w-3.5" /> {recorder.audio ? "重新录音" : "开始录音"}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={() => fileInputRef.current?.click()}>
          <Paperclip className="h-3.5 w-3.5" /> 上传音频
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.webm,.m4a"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) recorder.setAudio({ blob: file, filename: file.name })
            event.target.value = ""
          }}
        />
      </div>
      {recorder.audio ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">{recorder.audio.filename}</span>
          <span>{Math.round(recorder.audio.blob.size / 1024)}KB</span>
          <button type="button" className="ml-auto text-destructive" onClick={() => recorder.setAudio(null)} title="移除音频">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
