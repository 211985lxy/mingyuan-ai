"use client"

import { useCallback, useState } from "react"
import { findLatestAimDeliverableId } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

/**
 * 数据复盘目标内容：列表点选优先，否则回落到当前会话交付物。
 */
export function useAimRetroTarget(messages: AimWorkbenchMessage[]) {
  const [retroTargetGenerationId, setRetroTargetGenerationId] = useState<string | null>(null)

  const resolveRetroTargetGenerationId = useCallback(() => {
    const selected = retroTargetGenerationId?.trim()
    if (selected) return selected
    return findLatestAimDeliverableId(messages) ?? null
  }, [messages, retroTargetGenerationId])

  const clearRetroTarget = useCallback(() => {
    setRetroTargetGenerationId(null)
  }, [])

  return {
    retroTargetGenerationId,
    setRetroTargetGenerationId,
    resolveRetroTargetGenerationId,
    clearRetroTarget,
  }
}
