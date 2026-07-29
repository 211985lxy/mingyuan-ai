"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  createVideoCopyExtraction,
  syncVideoCopyExtraction,
} from "@/lib/api/client"
import { completeVideoCopyExtraction } from "@/lib/aim/video-copy-input"
import type { ApiVideoCopyExtraction } from "@/types/api"

export function useAimVideoCopyInput(input: {
  enabled: boolean
  onCompleted: (record: ApiVideoCopyExtraction) => void
}) {
  const { enabled, onCompleted } = input
  const [processingRunId, setProcessingRunId] = useState<number | null>(null)
  const runIdRef = useRef(0)
  const toastIdRef = useRef<string | number | null>(null)

  const cancelVideoProcessing = useCallback(() => {
    runIdRef.current += 1
    setProcessingRunId(null)
    if (toastIdRef.current != null) toast.dismiss(toastIdRef.current)
    toastIdRef.current = null
    toast.message("已停止等待，提取任务仍会保留在「爆款拆解」记录中")
  }, [])

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      if (toastIdRef.current != null) toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }
  }, [enabled])

  const processVideoUrl = useCallback(async (url: string) => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setProcessingRunId(runId)
    const toastId = toast.loading("正在提取视频文案并拆解爆款结构…")
    toastIdRef.current = toastId

    try {
      const record = await completeVideoCopyExtraction(url, {
        create: createVideoCopyExtraction,
        sync: syncVideoCopyExtraction,
      })
      if (runIdRef.current !== runId) {
        toast.dismiss(toastId)
        return
      }
      toast.success(
        record.analysisError ? "文案已提取，拆解暂时失败，已带入内容创作" : "文案提取和拆解完成，已带入内容创作",
        { id: toastId },
      )
      toastIdRef.current = null
      onCompleted(record)
    } catch (error) {
      if (runIdRef.current !== runId) {
        toast.dismiss(toastId)
        return
      }
      toast.error(error instanceof Error ? error.message : "视频文案提取失败，请稍后重试。", { id: toastId })
      toastIdRef.current = null
    } finally {
      setProcessingRunId((current) => current === runId ? null : current)
    }
  }, [onCompleted])

  return {
    isProcessingVideo: enabled && processingRunId !== null,
    processVideoUrl,
    cancelVideoProcessing,
  }
}
