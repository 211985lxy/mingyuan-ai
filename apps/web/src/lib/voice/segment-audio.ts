"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { importVoiceHistory, synthesizeVoiceAudio } from "@/lib/api/voice"
import { splitTextForSynthesis } from "@/lib/voice/segment-text"

export type SegmentStatus = "idle" | "loading" | "ready" | "error"

export interface SegmentAudioInput {
  text: string
  voiceId: string | null
  model: string | null
  speed: number
}

export interface SegmentAudioController {
  /** 分段文本（按句子边界切分，与合成粒度一致） */
  segments: string[]
  statuses: SegmentStatus[]
  /** 每段的试听地址（objectURL），未生成为 null */
  segmentUrls: (string | null)[]
  /** 全部段落拼接后的整体地址；有段缺失时为 null */
  combinedUrl: string | null
  busy: boolean
  error: string | null
  generateAll: (input: SegmentAudioInput) => Promise<void>
  regenerateSegment: (index: number) => Promise<void>
}

/** 合成单段；库返回的临时地址用完即释放，只保留自有 blob。 */
async function synthesizeOne(text: string, input: SegmentAudioInput): Promise<Blob> {
  const result = await synthesizeVoiceAudio({
    text,
    voiceId: input.voiceId,
    model: input.model,
    speed: input.speed,
  })
  URL.revokeObjectURL(result.objectUrl)
  return result.blob
}

/** 全部段齐备才拼接：缺段时返回 null，不产出半截成品。 */
function buildCombined(blobs: (Blob | null)[]): Blob | null {
  if (blobs.length === 0 || blobs.some((blob) => !blob)) return null
  return new Blob(blobs as Blob[], { type: "audio/mpeg" })
}

function revokeAll(urls: (string | null)[]) {
  for (const url of urls) if (url) URL.revokeObjectURL(url)
}

async function saveHistory(input: SegmentAudioInput, count: number, blobs: (Blob | null)[]) {
  const combined = buildCombined(blobs)
  if (!combined) return
  try {
    await importVoiceHistory({
      text: input.text.trim(),
      model: input.model || "s2.1-pro-free",
      voiceId: input.voiceId,
      segments: count,
      audio: combined,
    })
  } catch {
    // 历史入库失败不影响试听与下载，仅少一条记录
  }
}

/**
 * 分段音频的 blob 仓库：负责 objectURL 的创建、替换与释放。
 *
 * 单独成 hook 是为了让 useSegmentAudio 只做编排（骨架屏/门禁都限制单函数行数）。
 * blob 存 ref 而非 state——大对象进 state 会拖慢每次渲染。
 */
function useSegmentBlobStore() {
  const [segmentUrls, setSegmentUrls] = useState<(string | null)[]>([])
  const [combinedUrl, setCombinedUrl] = useState<string | null>(null)
  const blobsRef = useRef<(Blob | null)[]>([])
  const urlsRef = useRef<(string | null)[]>([])

  const reset = useCallback(() => {
    revokeAll(urlsRef.current)
    urlsRef.current = []
    blobsRef.current = []
    setSegmentUrls([])
    setCombinedUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [])

  useEffect(() => reset, [reset])

  const patch = useCallback((index: number, blob: Blob) => {
    blobsRef.current[index] = blob
    const previous = urlsRef.current[index]
    if (previous) URL.revokeObjectURL(previous)
    urlsRef.current[index] = URL.createObjectURL(blob)
    setSegmentUrls([...urlsRef.current])
  }, [])

  const recombine = useCallback(() => {
    const combined = buildCombined(blobsRef.current)
    setCombinedUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return combined ? URL.createObjectURL(combined) : null
    })
  }, [])

  return { segmentUrls, combinedUrl, blobsRef, reset, patch, recombine }
}

/**
 * 逐段配音：保留每一段的音频，支持单独重生成后重新拼接。
 *
 * 长文的常见返工是「某一段念错」，整篇重跑既费时又费额度；
 * 这里把粒度降到段，重生成只跑该段。blob 存在 ref 中避免大对象进 state。
 */
export function useSegmentAudio(): SegmentAudioController {
  const [segments, setSegments] = useState<string[]>([])
  const [statuses, setStatuses] = useState<SegmentStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<SegmentAudioInput | null>(null)
  const store = useSegmentBlobStore()

  const mark = useCallback((index: number, status: SegmentStatus) => {
    setStatuses((current) => current.map((value, i) => (i === index ? status : value)))
  }, [])

  const generateAll = useCallback(async (input: SegmentAudioInput) => {
    const list = splitTextForSynthesis(input.text)
    if (list.length === 0) return
    store.reset()
    inputRef.current = input
    setSegments(list)
    setStatuses(list.map(() => "loading"))
    setBusy(true)
    setError(null)

    let failed = 0
    for (let index = 0; index < list.length; index += 1) {
      try {
        store.patch(index, await synthesizeOne(list[index], input))
        mark(index, "ready")
      } catch {
        failed += 1
        mark(index, "error")
      }
    }
    store.recombine()
    setBusy(false)
    if (failed > 0) {
      setError(`${failed} 段合成失败，可在下方单独重试`)
      return
    }
    await saveHistory(input, list.length, store.blobsRef.current)
  }, [mark, store])

  const regenerateSegment = useCallback(async (index: number) => {
    const input = inputRef.current
    const text = segments[index]
    if (!input || !text) return
    mark(index, "loading")
    setBusy(true)
    setError(null)
    try {
      store.patch(index, await synthesizeOne(text, input))
      mark(index, "ready")
      store.recombine()
    } catch (caught) {
      mark(index, "error")
      setError(caught instanceof Error ? caught.message : `第 ${index + 1} 段重生成失败`)
    } finally {
      setBusy(false)
    }
  }, [mark, segments, store])

  return {
    segments,
    statuses,
    segmentUrls: store.segmentUrls,
    combinedUrl: store.combinedUrl,
    busy,
    error,
    generateAll,
    regenerateSegment,
  }
}
