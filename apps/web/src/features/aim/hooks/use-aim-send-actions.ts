"use client"

import { useCallback, useRef } from "react"
import { toast } from "sonner"
import {
  buildAimEditorContext,
} from "@/lib/aim/workbench-helpers"
import { shouldIsolateWritingInstruction, detectAimWorkbenchCommand } from "@/lib/aim-workbench-commands"
import { planWorkbenchSkillApply } from "@/features/aim/aim-skill-utils"
import type { AimMethodologySignal, AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import type { AimEditorSelection } from "@/components/aim/benchmark-editor-panel"
import type { AimWorkbenchMessage as ChatMessage, AimImageAttachment } from "@/lib/aim/workbench-types"
import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"

interface UseAimSendActionsOptions {
  messages: ChatMessage[]
  input: string
  /** 当前会话智能体；用于判断技能是否需要跨引擎委托（缺省时交给服务端判） */
  selectedAgentId?: string
  hasEditorSelection: boolean
  referenceSelection: AimEditorSelection
  draftSelection: AimEditorSelection
  editorText: string
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  editorPanelLabels: ReturnType<typeof getAimEditorPanelLabels>
  imageAttachments: AimImageAttachment[]
  setInput: (value: string | ((prev: string) => string)) => void
  sendText: (text: string, options?: Record<string, unknown>) => Promise<void>
  generateWithInput: (input: string, options?: Record<string, unknown>) => Promise<string | number | undefined>
  runWorkbenchCommand: (command: import("@/lib/aim-workbench-commands").AimWorkbenchCommand) => boolean
}

/**
 * Send/generate/retry/skill actions for the AIM workbench page.
 *
 * Extracted from aim/page.tsx to decouple action dispatch from page state.
 */
/**
 * @description React Hook：aimsendactions
 * @param options - 配置选项
 * @returns 无返回值
 */
export function useAimSendActions(options: UseAimSendActionsOptions) {
  // 技能按钮只把提示词填进输入框，真正发送发生在下一次点击。委托意图挂在
  // 插入的那段提示词上：输入框里还留着它才算数，用户清空重写则自动失效。
  const pendingSkillDelegationRef = useRef<{ prompt: string; executionAgentId: string } | null>(null)
  // 方法论类技能信号同样挂在那段 prompt 上：输入框还留着才算本轮生效。
  const pendingMethodologySignalsRef = useRef<{ prompt: string; signals: AimMethodologySignal[] } | null>(null)

  const handleUseSkill = useCallback((skill: AimWorkbenchSkill) => {
    // 内容目的（流量/获客/故事）互斥替换；其它技能前置拼接。用户正文原样保留。
    const { delegation, nextInput, methodologySignals } = planWorkbenchSkillApply(options, skill)
    pendingSkillDelegationRef.current = delegation
    pendingMethodologySignalsRef.current = methodologySignals.length
      ? { prompt: nextInput.includes(skill.prompt) ? skill.prompt : nextInput, signals: methodologySignals }
      : null
    if (nextInput !== options.input) options.setInput(nextInput)
    toast.success("技能指令已填入")
  }, [options])

  /** 取出本次发送该用的委托引擎，并清掉一次性意图。 */
  function takeSkillDelegation(text: string): { executionAgentId?: string } {
    const pending = pendingSkillDelegationRef.current
    pendingSkillDelegationRef.current = null
    if (!pending || !text.includes(pending.prompt)) return {}
    return { executionAgentId: pending.executionAgentId }
  }

  /** 只看不取：意图门闩用来判断要不要跳过确认、强制走 chat。 */
  function peekSkillDelegation(text: string): { executionAgentId?: string } {
    const pending = pendingSkillDelegationRef.current
    if (!pending || !text.includes(pending.prompt)) return {}
    return { executionAgentId: pending.executionAgentId }
  }

  /** 取出本轮生效的方法论信号（输入框仍含技能 prompt 才算数），并清空一次性意图。 */
  function takeMethodologySignals(text: string): { activeMethodologySignals?: AimMethodologySignal[] } {
    const pending = pendingMethodologySignalsRef.current
    pendingMethodologySignalsRef.current = null
    if (!pending || !text.includes(pending.prompt) || !pending.signals.length) return {}
    return { activeMethodologySignals: pending.signals }
  }

  /** 只看不取：判断本轮是否有方法论信号（不消费）。 */
  function peekMethodologySignals(text: string): { activeMethodologySignals?: AimMethodologySignal[] } {
    const pending = pendingMethodologySignalsRef.current
    if (!pending || !text.includes(pending.prompt) || !pending.signals.length) return {}
    return { activeMethodologySignals: pending.signals }
  }

  async function handleSend() {
    const text = options.input.trim()
    const delegation = takeSkillDelegation(text)
    const methodologySignals = takeMethodologySignals(text)
    await options.sendText(text, options.hasEditorSelection ? {
      ...delegation,
      ...methodologySignals,
      editorContext: buildAimEditorContext({
        action: "用户追问",
        referenceSelection: options.referenceSelection.text,
        draftSelection: options.draftSelection.text,
        editorText: options.editorText,
        labels: options.editorPanelLabels,
      }),
      editorApplyRange: options.draftSelection.text.trim() ? options.draftSelection.range : undefined,
      images: options.imageAttachments,
    } : { ...delegation, ...methodologySignals, images: options.imageAttachments })
  }

  async function handleGenerate() {
    if (options.hasEditorSelection || options.imageAttachments.length > 0) {
      await handleSend()
      return
    }
    const currentInput = options.input.trim()
    // generate 不支持 executionAgentId，会静默丢掉委托；有委托必须走 chat，
    // 否则质检技能会落到当前会话的润色引擎上。
    if (peekSkillDelegation(currentInput).executionAgentId) {
      await handleSend()
      return
    }
    const startsNewTask = shouldIsolateWritingInstruction(currentInput, options.messages.length > 0)
    const workbenchCommand = detectAimWorkbenchCommand(currentInput)
    if (!startsNewTask && workbenchCommand && options.runWorkbenchCommand(workbenchCommand)) return
    takeSkillDelegation(currentInput)
    const methodologySignals = takeMethodologySignals(currentInput)
    await options.generateWithInput(currentInput, { startsNewTask, ...methodologySignals })
  }

  function retryFailedMessage(message: ChatMessage, busy: boolean) {
    if (!message.failure || busy) return
    if (message.failure.kind === "generate") {
      void options.generateWithInput(message.failure.retryText, { retryMessageId: message.id })
      return
    }
    void options.sendText(message.failure.retryText, { retryMessageId: message.id })
  }

  // peek/take 导出给意图门闩：主发送不走 handleSend，必须由门闩自行取走委托
  return {
    handleUseSkill,
    handleSend,
    handleGenerate,
    retryFailedMessage,
    takeSkillDelegation,
    peekSkillDelegation,
    takeMethodologySignals,
    peekMethodologySignals,
  }
}
