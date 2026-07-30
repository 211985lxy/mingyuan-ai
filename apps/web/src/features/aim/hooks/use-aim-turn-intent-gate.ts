"use client"

import { useCallback, useState } from "react"
import type { ContentFormat } from "@/lib/api/client"
import type { AimEditorContext } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import { resolveAimTurnIntentRemote } from "@/lib/api/aim"
import {
  resolveAimTurnIntent,
  shouldConfirmTurnIntent,
  type AimTurnIntent,
} from "@/lib/aim-turn-intent"
import { shouldIsolateWritingInstruction, detectAimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import type { AimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import { buildAimEditorContext, findLatestAimDeliverableText } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

export type PendingTurnIntent = {
  text: string
  intent: AimTurnIntent
  startsNewTask: boolean
  source?: string
}

export type AimSendTextFn = (
  text: string,
  options?: { editorContext?: AimEditorContext; executionAgentId?: string },
) => Promise<unknown>

/** 取出技能按钮挂上的一次性委托意图；无委托时返回空对象，不带 undefined 键 */
export type ConsumeSkillDelegationFn = (text: string) => { executionAgentId?: string }

function resolveChatEditorContext(input: {
  editorText: string
  messages: AimWorkbenchMessage[]
  labels: Pick<EditorPanelLabels, "documentType" | "referenceTitle" | "draftTitle">
  intent: AimTurnIntent
}): AimEditorContext | undefined {
  const draftText = input.editorText.trim() || findLatestAimDeliverableText(input.messages)
  if (!draftText) return undefined
  const adviceAction = input.intent.summary.includes("优化建议")
    || input.intent.avoid.some((item) => item.includes("整篇") || item.includes("新稿"))
  return buildAimEditorContext({
    action: adviceAction
      ? "优化建议（诊断当前成稿，禁止另写整篇）"
      : "对话追问（引用当前成稿）",
    referenceSelection: "",
    draftSelection: "",
    editorText: draftText,
    labels: input.labels,
  })
}

function buildSendOptions(
  editorContext: AimEditorContext | undefined,
  delegation: { executionAgentId?: string },
): { editorContext?: AimEditorContext; executionAgentId?: string } | undefined {
  const options = {
    ...(editorContext ? { editorContext } : {}),
    ...delegation,
  }
  return Object.keys(options).length > 0 ? options : undefined
}

function dispatchByIntent(input: {
  text: string
  intent: AimTurnIntent
  startsNewTask: boolean
  editorText: string
  messages: AimWorkbenchMessage[]
  editorLabels: Pick<EditorPanelLabels, "documentType" | "referenceTitle" | "draftTitle">
  sendText: AimSendTextFn
  generateWithInput: (
    raw: string,
    options?: { startsNewTask?: boolean; confirmedTurnIntent?: AimTurnIntent },
  ) => Promise<unknown>
  consumeSkillDelegation?: ConsumeSkillDelegationFn
}) {
  // 主发送按钮绕开 handleSend，必须在这里取走一次性委托，否则质检技能会静默落到润色引擎
  const delegation = input.consumeSkillDelegation?.(input.text) ?? {}
  // generate 故意不支持 executionAgentId；有跨引擎委托时强制走 chat，避免质检变成成稿
  if (input.intent.action === "chat" || delegation.executionAgentId) {
    const editorContext = input.startsNewTask
      ? undefined
      : resolveChatEditorContext({
          editorText: input.editorText,
          messages: input.messages,
          labels: input.editorLabels,
          intent: input.intent,
        })
    void input.sendText(input.text, buildSendOptions(editorContext, delegation))
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
 * chat 意图走对话入口，并挂载当前成稿，避免「这篇/这个文案」无上下文。
 */
export function useAimTurnIntentGate(input: {
  hasEditorSelection: boolean
  imageCount: number
  handleGenerate: () => void
  text: string
  messageCount: number
  messages: AimWorkbenchMessage[]
  editorText: string
  editorLabels: Pick<EditorPanelLabels, "documentType" | "referenceTitle" | "draftTitle">
  runWorkbenchCommand: (command: AimWorkbenchCommand) => boolean
  defaultFormats: ContentFormat[]
  projectEnabled: boolean
  selectedProjectId: string
  sendText: AimSendTextFn
  generateWithInput: (
    raw: string,
    options?: { startsNewTask?: boolean; confirmedTurnIntent?: AimTurnIntent },
  ) => Promise<unknown>
  /** 技能按钮留下的一次性委托；主发送走门闩时必须由此取走 */
  consumeSkillDelegation?: ConsumeSkillDelegationFn
  /** 只看不取：有跨引擎委托时跳过生成确认，直接走 chat */
  peekSkillDelegation?: ConsumeSkillDelegationFn
}) {
  const [pendingTurnIntent, setPendingTurnIntent] = useState<PendingTurnIntent | null>(null)
  const [intentResolving, setIntentResolving] = useState(false)
  // 只解构确认/分发真正用到的稳定引用，避免依赖整个 input 大对象导致每次击键都重建回调。
  const { generateWithInput, sendText, consumeSkillDelegation } = input

  const clearPendingTurnIntent = useCallback(() => {
    setPendingTurnIntent(null)
    setIntentResolving(false)
  }, [])

  const handleConfirmTurnIntent = useCallback((intent: AimTurnIntent) => {
    if (!pendingTurnIntent) return
    const { text, startsNewTask } = pendingTurnIntent
    setPendingTurnIntent(null)
    dispatchByIntent({
      text,
      intent,
      startsNewTask,
      editorText: input.editorText,
      messages: input.messages,
      editorLabels: input.editorLabels,
      sendText,
      generateWithInput,
      consumeSkillDelegation,
    })
  }, [pendingTurnIntent, generateWithInput, sendText, consumeSkillDelegation, input.editorText, input.messages, input.editorLabels])

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

      // 跨引擎技能委托只走 chat，跳过「局部修改」类确认弹层，避免委托意图卡在确认态
      const skillDelegation = input.peekSkillDelegation?.(currentInput)
      if (shouldConfirmTurnIntent(intent) && !skillDelegation?.executionAgentId) {
        setPendingTurnIntent({ text: currentInput, intent, startsNewTask, source })
        return
      }
      dispatchByIntent({
        text: currentInput,
        intent,
        startsNewTask,
        editorText: input.editorText,
        messages: input.messages,
        editorLabels: input.editorLabels,
        sendText: input.sendText,
        generateWithInput: input.generateWithInput,
        consumeSkillDelegation: input.consumeSkillDelegation,
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
