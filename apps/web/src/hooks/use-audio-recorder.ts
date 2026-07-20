import { useState, useEffect, useCallback } from "react"
import { AudioWavRecorder } from "@/lib/audio-recorder"
import { toast } from "sonner"

export interface UseAudioRecorderOptions {
  onTranscribeSuccess: (text: string) => void
  onTranscribeError?: (error: Error | unknown) => void
  transcribeFn: (blob: Blob) => Promise<{ text: string }>
}

/**
 * 通用网页录音与 ASR 智能转写 React Hook。
 * 封装录制状态、倒计时、实时频域数据提取、ASR 请求与设备资源释放逻辑。
 */
/**
 * @description React Hook：audiorecorder
 * @param options - 配置选项
 * @returns 无返回值
 */
export function useAudioRecorder({
  onTranscribeSuccess,
  onTranscribeError,
  transcribeFn,
}: UseAudioRecorderOptions) {
  const [recorder] = useState(() => {
    if (typeof window !== "undefined") {
      return new AudioWavRecorder()
    }
    return null
  })

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0)
  const [volData, setVolData] = useState<number[]>([10, 10, 10, 10, 10, 10, 10])

  // ASR 真实频谱波动与动画帧
  useEffect(() => {
    let animFrame: number
    if (isRecording && recorder) {
      const updateWave = () => {
        const spectrum = recorder.getSpectrum()
        setVolData(spectrum)
        animFrame = requestAnimationFrame(updateWave)
      }
      animFrame = requestAnimationFrame(updateWave)
    }
    return () => {
      if (animFrame) cancelAnimationFrame(animFrame)
    }
  }, [isRecording, recorder])

  const handleStopRecording = useCallback(async () => {
    if (!recorder || !recorder.isRecording()) return
    setIsRecording(false)
    setIsTranscribing(true)
    // 停止录音时重置频谱数据，避免在 effect 顶级作用域中同步 setState
    setVolData([10, 10, 10, 10, 10, 10, 10])
    try {
      const audioBlob = await recorder.stop()
      const response = await transcribeFn(audioBlob)
      if (response.text?.trim()) {
        const text = response.text.trim()
        onTranscribeSuccess(text)
        toast.success("语音转写成功")
      } else {
        toast.warning("未检测到有效语音，请重新录音")
      }
    } catch (err) {
      console.error("Transcribe failed:", err)
      if (onTranscribeError) {
        onTranscribeError(err)
      } else {
        toast.error(err instanceof Error ? err.message : "语音识别失败，请检查阿里云 ASR 配置")
      }
    } finally {
      setIsTranscribing(false)
    }
  }, [recorder, transcribeFn, onTranscribeSuccess, onTranscribeError])

  // ASR 录音倒计时计时器，最大 60 秒上限
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isRecording) {
      timer = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 60) {
            handleStopRecording()
            return 60
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [isRecording, handleStopRecording])

  // 页面卸载或组件销毁时，确保录制流和物理设备被彻底静音释放
  useEffect(() => {
    return () => {
      if (recorder && recorder.isRecording()) {
        recorder.stop().catch(() => {})
      }
    }
  }, [recorder])

  const handleStartRecording = useCallback(async () => {
    if (!recorder) return
    try {
      await recorder.start()
      setIsRecording(true)
      setRecordDuration(0)
      toast.info("已启动麦克风，请开始说话")
    } catch (err) {
      console.error("Start recording failed:", err)
      toast.error("麦克风启动失败，请检查浏览器录音权限")
    }
  }, [recorder])

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return {
    isRecording,
    isTranscribing,
    recordDuration,
    volData,
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
    formatTime,
  }
}
