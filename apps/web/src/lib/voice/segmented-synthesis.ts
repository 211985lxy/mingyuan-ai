"use client"

import { useCallback, useState } from "react"
import { importVoiceHistory, synthesizeVoiceAudio } from "@/lib/api/voice"
import { splitTextForSynthesis } from "@/lib/voice/segment-text"

type SynthesisPhase = "idle" | "synthesizing" | "saving"

interface SynthesisHandlers {
  onDone: (payload: { objectUrl: string; charCount: number | null }) => void
  onSaved: () => void
}

/**
 * 逐段合成全文并在浏览器内拼接：免费档长文较慢（约 12.5 字/秒），进度可见、不占服务端长连接。
 * 语音工坊与数字人工坊共用。
 */
export function useSegmentedSynthesis(handlers: SynthesisHandlers) {
  const { onDone, onSaved } = handlers
  const [phase, setPhase] = useState<SynthesisPhase>("idle")
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(
    async (input: { text: string; voiceId: string | null; model: string | null; speed: number }) => {
      const trimmed = input.text.trim()
      if (!trimmed || phase !== "idle") return
      setError(null)
      setPhase("synthesizing")
      try {
        const segments = splitTextForSynthesis(trimmed)
        setProgress({ done: 0, total: segments.length })
        const parts: Blob[] = []
        for (let i = 0; i < segments.length; i++) {
          setProgress({ done: i, total: segments.length })
          const result = await synthesizeVoiceAudio({
            text: segments[i],
            voiceId: input.voiceId,
            model: input.model,
            speed: input.speed,
          })
          parts.push(result.blob)
          URL.revokeObjectURL(result.objectUrl)
        }
        setProgress({ done: segments.length, total: segments.length })
        const combined = new Blob(parts, { type: "audio/mpeg" })
        const objectUrl = URL.createObjectURL(combined)
        onDone({ objectUrl, charCount: trimmed.length })

        setPhase("saving")
        await importVoiceHistory({
          text: trimmed,
          model: input.model || "s2.1-pro-free",
          voiceId: input.voiceId,
          segments: segments.length,
          audio: combined,
        })
        onSaved()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "配音失败，请稍后重试")
      } finally {
        setPhase("idle")
      }
    },
    [onDone, onSaved, phase],
  )

  return { phase, progress, error, generate }
}
