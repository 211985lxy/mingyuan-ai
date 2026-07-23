"use client"

import { useCallback, useState } from "react"
import type { ContentFormat } from "@/lib/api/client"
import { resolveAimTurnIntentRemote } from "@/lib/api/aim"
import {
  resolveAimTurnIntent,
  shouldConfirmTurnIntent,
  type AimTurnIntent,
} from "@/lib/aim-turn-intent"
import { shouldIsolateWritingInstruction, detectAimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import type { AimWorkbenchCommand } from "@/lib/aim-workbench-commands"

export type PendingTurnIntent = {
  text: string
  intent: AimTurnIntent
  startsNewTask: boolean
  source?: string
}

/**
 * 直接模式：生成前意图解析/确认门闩。
 * 抽出以控制 use-aim-workbench 文件体量（arch:size ≤500）。
 */
export function useAimTurnIntentGate(input: {
  hasEditorSelection: boolean
  imageCount: number
  handleGenerate: () => void
  text: string
  messageCount: number
  runWorkbenchCommand: (command: AimWorkbenchCommand) => boolean
  defaultFormats: ContentFormat[]
  projectEnabled: boolean
  selectedProjectId: string
  generateWithInput: (
    raw: string,
    options?: { startsNewTask?: boolean; confirmedTurnIntent?: AimTurnIntent },
  ) => Promise<unknown>
}) {
  const [pendingTurnIntent, setPendingTurnIntent] = useState<PendingTurnIntent | null>(null)
  const [intentResolving, setIntentResolving] = useState(false)

  const clearPendingTurnIntent = useCallback(() => {
    setPendingTurnIntent(null)
    setIntentResolving(false)
  }, [])

  const handleConfirmTurnIntent = useCallback((intent: AimTurnIntent) => {
    if (!pendingTurnIntent) return
    const { text, startsNewTask } = pendingTurnIntent
    setPendingTurnIntent(null)
    void input.generateWithInput(text, { startsNewTask, confirmedTurnIntent: intent })
  }, [pendingTurnIntent, input])

  const handleCancelTurnIntent = useCallback(() => {
    setPendingTurnIntent(null)
  }, [])

  const handleGenerateOrPlan = useCallback(() => {
    if (pendingTurnIntent || intentResolving) return
    if (input.hasEditorSelection || input.imageCount > 0) {
      input.handleGenerate()
      return
    }
    const currentInput = input.text.trim()
    if (!currentInput) return
    const startsNewTask = shouldIsolateWritingInstruction(currentInput, input.messageCount > 0)
    const workbenchCommand = detectAimWorkbenchCommand(currentInput)
    if (!startsNewTask && workbenchCommand && input.runWorkbenchCommand(workbenchCommand)) return

    const archive = {
      hasProject: input.projectEnabled ? Boolean(input.selectedProjectId) : false,
    }

    void (async () => {
      setIntentResolving(true)
      let intent = resolveAimTurnIntent({
        rawInput: currentInput,
        targetFormats: input.defaultFormats,
        archive,
      })
      let source = "rule"
      try {
        const remote = await resolveAimTurnIntentRemote({
          rawInput: currentInput,
          targetFormats: input.defaultFormats,
          projectId: input.selectedProjectId || undefined,
          archive,
        })
        intent = remote.intent
        source = remote.source
      } catch {
        // 网络失败：保留本地规则意图
      } finally {
        setIntentResolving(false)
      }

      if (shouldConfirmTurnIntent(intent)) {
        setPendingTurnIntent({ text: currentInput, intent, startsNewTask, source })
        return
      }
      void input.generateWithInput(currentInput, { startsNewTask, confirmedTurnIntent: intent })
    })()
  }, [input, pendingTurnIntent, intentResolving])

  return {
    pendingTurnIntent,
    intentResolving,
    clearPendingTurnIntent,
    handleConfirmTurnIntent,
    handleCancelTurnIntent,
    handleGenerateOrPlan,
  }
}
