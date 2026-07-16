"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import {
  recordAimRunEvent,
  updateAimWorkflowStatus,
  upsertContentOutcome,
  type AimCalibrationRule,
  type AimDecisionSnapshot,
  type AimRetroSnapshot,
} from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ChatMessage, RecordDialogMode, RecordDialogState } from "@/features/aim/aim-workbench-types"

interface UseAimRecordDialogParams {
  messages: ChatMessage[]
  selectedAgentId: AimAgentId
  selectedProjectId: string
  refreshHistory: (options?: { force?: boolean; agentId?: AimAgentId }) => void
  refreshProjectWorkflow: () => void
}

function reportRunEvent(runId: string | null | undefined, metadata?: Record<string, unknown>) {
  if (!runId) return
  void recordAimRunEvent(runId, "accepted", metadata).catch(() => undefined)
}

export function useAimRecordDialog({
  messages,
  selectedAgentId,
  selectedProjectId,
  refreshHistory,
  refreshProjectWorkflow,
}: UseAimRecordDialogParams) {
  const [recordDialog, setRecordDialog] = useState<RecordDialogState | null>(null)
  const [decisionForm, setDecisionForm] = useState<AimDecisionSnapshot>({
    summary: "",
    targetUser: "",
    expectedSignal: "",
    confidence: "",
  })
  const [publishForm, setPublishForm] = useState({
    publishPlatform: "抖音",
    publishUrl: "",
  })
  const [retroForm, setRetroForm] = useState<AimRetroSnapshot>({
    summary: "",
    actualData: "",
    verdict: "",
    nextRule: "",
  })
  const [outcomeForm, setOutcomeForm] = useState<Record<string, string>>({})
  const [outcomeWindow, setOutcomeWindow] = useState<"7" | "14" | "30">("7")
  const [retroRuleForm, setRetroRuleForm] = useState<AimCalibrationRule>({
    rule: "",
    source: "内容复盘",
  })

  const openRecordDialog = useCallback((msgId: string, mode: RecordDialogMode) => {
    const base = messages.find((message) => message.id === msgId)?.deliverables
    if (!base?.id || base.id.startsWith("polish-")) {
      toast.error("只有已保存的内容才能记录")
      return
    }
    if (mode === "decision") {
      const spec = base.taskSpec
      setDecisionForm({
        summary: spec?.realProblem || spec?.goal || "",
        targetUser: spec?.targetCustomer || "",
        expectedSignal: spec?.desiredAction || "",
        confidence: spec?.riskLevel === "high" ? "低" : spec?.riskLevel === "medium" ? "中" : "高",
      })
    } else if (mode === "publish") {
      setPublishForm({
        publishPlatform: "抖音",
        publishUrl: "",
      })
    } else {
      setRetroForm({
        summary: "",
        actualData: "",
        verdict: "",
        nextRule: "",
      })
      setRetroRuleForm({
        rule: "",
        source: "内容复盘",
      })
      setOutcomeForm({})
      setOutcomeWindow("7")
    }
    setRecordDialog({ mode, generationId: base.id })
  }, [messages])

  const handleSubmitRecordDialog = useCallback(async () => {
    if (!recordDialog) return

    try {
      if (recordDialog.mode === "decision") {
        if (!decisionForm.summary.trim()) {
          toast.error("先写清楚为什么值得发")
          return
        }
        await updateAimWorkflowStatus(recordDialog.generationId, {
          decisionSnapshot: {
            summary: decisionForm.summary.trim(),
            targetUser: decisionForm.targetUser?.trim(),
            expectedSignal: decisionForm.expectedSignal?.trim(),
            confidence: decisionForm.confidence?.trim(),
          },
        })
        toast.success("已记下发布前判断")
      } else if (recordDialog.mode === "publish") {
        await updateAimWorkflowStatus(recordDialog.generationId, {
          workflowStatus: "published",
          publishPlatform: publishForm.publishPlatform.trim() || "抖音",
          publishUrl: publishForm.publishUrl.trim(),
        })
        const publishedMessage = messages.find((message) => message.deliverables?.id === recordDialog.generationId)
        reportRunEvent(publishedMessage?.runId, { workflowStatus: "published" })
        toast.success("已登记发布")
      } else {
        if (!retroForm.summary.trim()) {
          toast.error("先写清楚这次结果怎么判断")
          return
        }
        await updateAimWorkflowStatus(recordDialog.generationId, {
          retroSnapshot: {
            summary: retroForm.summary.trim(),
            actualData: retroForm.actualData?.trim(),
            verdict: retroForm.verdict?.trim(),
            nextRule: retroForm.nextRule?.trim(),
          },
          calibrationRule: retroRuleForm.rule.trim()
            ? {
                rule: retroRuleForm.rule.trim(),
                source: retroRuleForm.source?.trim() || "内容复盘",
              }
            : undefined,
        })
        const hasOutcome = Object.values(outcomeForm).some((value) => value && value.trim())
        if (hasOutcome) {
          const num = (key: string) => {
            const raw = outcomeForm[key]
            if (!raw || !raw.trim()) return null
            const value = Number(raw)
            return Number.isFinite(value) ? value : null
          }
          await upsertContentOutcome(recordDialog.generationId, {
            collectWindowDay: Number(outcomeWindow) as 7 | 14 | 30,
            platform: publishForm.publishPlatform.trim() || undefined,
            dmCount: num("dmCount"),
            qualifiedLeadCount: num("qualifiedLeadCount"),
            appointmentCount: num("appointmentCount"),
            dealCount: num("dealCount"),
            revenue: num("revenue"),
            views: num("views"),
            saves: num("saves"),
            comments: num("comments"),
            shares: num("shares"),
            audienceFeedback: outcomeForm.audienceFeedback?.trim() || undefined,
          }).catch((error) => {
            console.error("[retro] outcome save failed (non-blocking)", error)
          })
        }
        toast.success("已保存复盘")
      }

      setRecordDialog(null)
      refreshHistory({ force: true, agentId: selectedAgentId })
      if (selectedProjectId) refreshProjectWorkflow()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }, [
    decisionForm,
    messages,
    outcomeForm,
    outcomeWindow,
    publishForm,
    recordDialog,
    refreshHistory,
    refreshProjectWorkflow,
    retroForm,
    retroRuleForm,
    selectedAgentId,
    selectedProjectId,
  ])

  return {
    recordDialog,
    setRecordDialog,
    decisionForm,
    setDecisionForm,
    publishForm,
    setPublishForm,
    retroForm,
    setRetroForm,
    outcomeForm,
    setOutcomeForm,
    outcomeWindow,
    setOutcomeWindow,
    retroRuleForm,
    setRetroRuleForm,
    openRecordDialog,
    handleSubmitRecordDialog,
  }
}
