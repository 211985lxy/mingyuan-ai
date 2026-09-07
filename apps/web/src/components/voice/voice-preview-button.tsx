"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Loader2, Square, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIM_SOFT_ACTION_CLASS } from "@/lib/aim/workbench-display"
import { synthesizeVoiceAudio } from "@/lib/api/voice"

export interface VoicePreviewButtonProps {
  /** 要配音的原文 */
  text: string
  /** 音色 id；留空用平台默认音色 */
  voiceId?: string | null
  /** 档位；留空用服务端默认（免费档） */
  model?: string | null
  /** 语速 0.5–2.0；改动后缓存键随之变化，会重新合成 */
  speed?: number
  /** 合成完成后是否自动开始播放；父层自带播放器时可关掉避免双轨 */
  autoplay?: boolean
  /** 按钮文案 */
  label?: string
  className?: string
  /** 试听成功后回调，便于父层展示播放器 */
  onSynthesized?: (payload: { objectUrl: string; charCount: number | null }) => void
}

interface AudioCache {
  key: string
  url: string
}

interface VoicePreviewController {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioBindings: {
    onError: () => void
    onEnded: () => void
    onPause: () => void
    onPlay: () => void
  }
  download: () => void
  error: string | null
  loading: boolean
  objectUrl: string | null
  play: () => Promise<void>
  playing: boolean
}

/**
 * 配音试听控制器：合成并缓存音频（内存级、不落库），驱动 <audio> 播放/停止。
 * 与展示层分离，保证单一函数不超过 80 行。
 */
export function useVoicePreview(props: VoicePreviewButtonProps): VoicePreviewController {
  const { text, voiceId, model, speed, autoplay = true, onSynthesized } = props
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null)
  const [cache, setCache] = useState<AudioCache | null>(null)
  const [playRequest, setPlayRequest] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const trimmed = text.trim()
  const cacheKey = `${model ?? ""}|${voiceId ?? ""}|${speed ?? 1}|${trimmed}`
  const objectUrl = cache && cache.key === cacheKey ? cache.url : null
  const error = errorState && errorState.key === cacheKey ? errorState.message : null

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      abortRef.current?.abort()
      audio?.pause()
    }
  }, [])

  useEffect(() => {
    if (playRequest === 0 || !objectUrl) return
    const element = audioRef.current
    if (!element) return
    void element.play().catch(() => {
      setErrorState({ key: cacheKey, message: "浏览器拦截了自动播放，请再点一次" })
    })
  }, [cacheKey, objectUrl, playRequest])

  const play = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (!trimmed) return
    if (objectUrl) {
      setPlayRequest((current) => current + 1)
      return
    }

    setLoading(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await synthesizeVoiceAudio(
        { text: trimmed, voiceId: voiceId ?? null, model: model ?? null, speed: speed ?? 1 },
        controller.signal,
      )
      setCache({ key: cacheKey, url: result.objectUrl })
      setErrorState(null)
      if (autoplay) setPlayRequest((current) => current + 1)
      onSynthesized?.({ objectUrl: result.objectUrl, charCount: result.charCount })
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return
      setErrorState({
        key: cacheKey,
        message: caught instanceof Error ? caught.message : "配音失败，请稍后重试",
      })
    } finally {
      setLoading(false)
    }
  }, [autoplay, cacheKey, model, objectUrl, onSynthesized, playing, speed, trimmed, voiceId])

  function download() {
    if (!objectUrl) return
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = `voice-${Date.now()}.mp3`
    link.click()
  }

  return {
    audioRef,
    audioBindings: {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onError: () => {
        setPlaying(false)
        setErrorState({ key: cacheKey, message: "音频播放失败，请重新生成" })
      },
    },
    download,
    error,
    loading,
    objectUrl,
    play,
    playing,
  }
}

/** 配音试听按钮：合成后播放/停止，成功后可下载这段 mp3。 */
export function VoicePreviewButton(props: VoicePreviewButtonProps) {
  const { audioRef, audioBindings, download, error, loading, objectUrl, play, playing } =
    useVoicePreview(props)
  const disabled = props.text.trim().length === 0 || loading
  const title = error ?? (objectUrl ? "重新播放 / 停止" : "生成并试听配音")

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        className={props.className ?? AIM_SOFT_ACTION_CLASS}
        disabled={disabled}
        onClick={() => void play()}
        title={title}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {!loading && playing ? <Square className="h-3.5 w-3.5" /> : null}
        {!loading && !playing ? <Volume2 className="h-3.5 w-3.5" /> : null}
        {loading ? "生成中" : playing ? "停止" : objectUrl ? "再听一次" : props.label ?? "配音试听"}
      </Button>
      {objectUrl ? (
        <>
          <Button size="sm" variant="ghost" className={props.className ?? AIM_SOFT_ACTION_CLASS} onClick={download} title="下载这段配音">
            <Download className="h-3.5 w-3.5" />
            下载
          </Button>
          <audio ref={audioRef} src={objectUrl} preload="auto" hidden {...audioBindings} />
        </>
      ) : null}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}

/** 工坊页用的主按钮形态 */
export function VoiceStudioPlayButton(props: VoicePreviewButtonProps) {
  return (
    <VoicePreviewButton
      {...props}
      label={props.label ?? "生成并试听"}
      className="h-9 gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
    />
  )
}
