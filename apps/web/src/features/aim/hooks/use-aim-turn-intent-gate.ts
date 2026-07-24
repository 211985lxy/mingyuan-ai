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

function dispatchByIntent(input: {
  text: string
  intent: AimTurnIntent
  startsNewTask: boolean
  sendText: (text: string) => Promise<unknown>
  generateWithInput: (
    raw: string,
    options?: { startsNewTask?: boolean; confirmedTurnIntent?: AimTurnIntent },
  ) => Promise<unknown>
}) {
  if (input.intent.action === "chat") {
    void input.sendText(input.text)
    return
  }
  void input.generateWithInput(input.text, {
    startsNewTask: input.startsNewTask,
    confirmedTurnIntent: input.intent,
  })
}

/**
 * 直接模式：生成前意图解析/确认门闩。
 * 抽出以控制 use-aim-workbench 文件体量（arch:size ≤500）。
 * chat 意图走对话入口，避免分析问句被 write_script 强制成 new_copy。
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
  sendText: (text: string) => Promise<unknown>
  generateWithInput: (
    raw: string,
    options?: { startsNewTask?: boolean; confirmedTurnIntent?: AimTurnIntent },
  ) => Promise<unknown>
}) {
  const [pendingTurnIntent, setPendingTurnIntent] = useState<PendingTurnIntent | null>(null)
  const [intentResolving, setIntentResolving] = useState(false)
  // 只解构确认/分发真正用到的稳定引用，避免依赖整个 input 大对象导致每次击键都重建回调。
  const { generateWithInput, sendText } = input

  const clearPendingTurnIntent = useCallback(() => {
    setPendingTurnIntent(null)
    setIntentResolving(false)
  }, [])

  const handleConfirmTurnIntent = useCallback((intent: AimTurnIntent) => {
    if (!pendingTurnIntent) return
    const { text, startsNewTask } = pendingTurnIntent
    setPendingTurnIntent(null)
    dispatchByIntent({ text, intent, startsNewTask, sendText, generateWithInput })
  }, [pendingTurnIntent, generateWithInput, sendText])

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
      dispatchByIntent({
        text: currentInput,
        intent,
        startsNewTask,
        sendText: input.sendText,
        generateWithInput: input.generateWithInput,
      })
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
