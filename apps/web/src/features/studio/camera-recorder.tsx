"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, CircleStop, RefreshCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const RECORDER_MIME_CANDIDATES = [
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
]

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm"
  return RECORDER_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "video/webm"
}

export function videoFileExtensionFromMimeType(mime: string): string {
  return mime.includes("mp4") ? ".mp4" : ".webm"
}

export function buildVideoFile(blob: Blob, mimeType: string, prefix: string): File {
  const extension = videoFileExtensionFromMimeType(mimeType)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")
  return new File([blob], `${prefix}-${stamp}${extension}`, {
    type: mimeType.split(";")[0] || "video/webm",
  })
}

export function formatRecordSeconds(total: number): string {
  const mm = String(Math.floor(total / 60)).padStart(2, "0")
  const ss = String(total % 60).padStart(2, "0")
  return `${mm}:${ss}`
}

/** 摄像头直录视频（授权视频/克隆素材共用）：录完生成 File，上传作备选。 */
export function CameraRecorder({
  label,
  hint,
  filePrefix,
  value,
  onChange,
}: {
  label: string
  hint?: string
  filePrefix: string
  value: File | null
  onChange: (file: File | null) => void
}) {
  const [cameraOn, setCameraOn] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const mimeTypeRef = useRef("video/webm")

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  // 卸载释放摄像头与计时器
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (timerRef.current) window.clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOn])

  async function handleStartCamera() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("当前浏览器不支持摄像头录制，请改用上传视频")
      return
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      setCameraOn(true)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ""
      toast.error(
        name === "NotAllowedError"
          ? "摄像头权限被拒绝：请在浏览器地址栏的权限设置中允许摄像头后重试"
          : name === "NotFoundError"
            ? "未检测到可用的摄像头设备"
            : "摄像头启动失败，请重试或改用上传视频",
      )
    }
  }

  function handleStartRecording() {
    const stream = streamRef.current
    if (!stream || recording) return
    const mimeType = pickRecorderMimeType()
    const recorder = new MediaRecorder(stream, { mimeType })
    mimeTypeRef.current = mimeType
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = handleRecordingStopped
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
    setSeconds(0)
    timerRef.current = window.setInterval(() => setSeconds((current) => current + 1), 1000)
  }

  function handleRecordingStopped() {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(blob)
    })
    onChange(buildVideoFile(blob, mimeTypeRef.current, filePrefix))
    if (timerRef.current) window.clearInterval(timerRef.current)
    stopCamera()
    setRecording(false)
    toast.success("录制完成，请确认后提交")
  }

  function handleReRecord() {
    onChange(null)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    void handleStartCamera()
  }

  function handleDelete() {
    onChange(null)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {value ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            已就绪
          </span>
        ) : null}
      </div>
      {value && !cameraOn ? (
        <RecordedCard
          name={value.name}
          size={value.size}
          previewUrl={previewUrl}
          onReRecord={handleReRecord}
          onDelete={handleDelete}
        />
      ) : cameraOn ? (
        <CameraRecordingControls
          videoRef={videoRef}
          recording={recording}
          seconds={seconds}
          onStart={handleStartRecording}
          onStop={() => recorderRef.current?.stop()}
          onCancel={stopCamera}
        />
      ) : (
        <>
          <Button type="button" variant="outline" onClick={() => void handleStartCamera()}>
            <Camera className="mr-1.5 h-4 w-4" />
            摄像头录制
          </Button>
          <VideoFileFallback label={label} value={value} onChange={onChange} />
        </>
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function RecordedCard({
  name,
  size,
  previewUrl,
  onReRecord,
  onDelete,
}: {
  name: string
  size: number
  previewUrl: string | null
  onReRecord: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-2 rounded-md border px-3 py-2.5">
      {previewUrl ? (
        <video src={previewUrl} controls className="aspect-video w-full rounded bg-black" preload="metadata">
          <track kind="captions" />
        </video>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {name}（{Math.max(1, Math.round(size / 1024))} KB）
        </p>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={onReRecord}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" />
            重录
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </div>
    </div>
  )
}

function CameraRecordingControls({
  videoRef,
  recording,
  seconds,
  onStart,
  onStop,
  onCancel,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  recording: boolean
  seconds: number
  onStart: () => void
  onStop: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
        {recording ? (
          <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {formatRecordSeconds(seconds)}
          </span>
        ) : null}
      </div>
      <div className="flex gap-2">
        {recording ? (
          <Button type="button" onClick={onStop}>
            <CircleStop className="mr-1.5 h-4 w-4" />
            停止录制
          </Button>
        ) : (
          <Button type="button" onClick={onStart}>
            <span className="mr-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
            开始录制
          </Button>
        )}
        {!recording ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** 备选：上传已录好的视频文件。 */
export function VideoFileFallback({
  label,
  value,
  onChange,
}: {
  label: string
  value: File | null
  onChange: (file: File | null) => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>或上传已有视频</span>
      <Input
        type="file"
        accept="video/*"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="h-7 w-auto max-w-[220px] text-xs"
        aria-label={label}
      />
      {value ? <span className="truncate">{value.name}</span> : null}
    </div>
  )
}
