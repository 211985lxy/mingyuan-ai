"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"

import type {
  OutcomeForm,
  OutcomeWindow,
  PublishRecordForm,
  WorkflowRecordDialogState,
  WorkflowRecordMode,
} from "@/components/aim/workflow-record-dialog"
import {
  updateAimWorkflowStatus,
  type AimCalibrationRule,
  type AimDecisionSnapshot,
  type AimRetroSnapshot,
} from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import { reportAimRunEvent } from "@/lib/aim/run-events"
import { getAimWorkflowStatusLabel } from "@/lib/aim/workbench-display"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { TaskSpec } from "@/lib/task-spec"

const ACCEPTED_WORKFLOW_STATUSES = new Set(["ready_to_shoot", "ready_to_publish", "published"])
const EMPTY_DECISION: AimDecisionSnapshot = { summary: "", targetUser: "", expectedSignal: "", confidence: "" }
const EMPTY_PUBLISH: PublishRecordForm = { publishPlatform: "抖音", publishUrl: "" }
const EMPTY_RETRO: AimRetroSnapshot = { summary: "", actualData: "", verdict: "", nextRule: "" }
const EMPTY_RULE: AimCalibrationRule = { rule: "", source: "内容复盘" }

/**
 * @description 解析aimoutcomenumber
 * @param form - 表单
 * @param key - 键
 * @returns 无返回值
 */
export function parseAimOutcomeNumber(form: OutcomeForm, key: string) {
  const raw = form[key]
  if (!raw?.trim()) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

async function saveDecisionRecord(generationId: string, form: AimDecisionSnapshot) {
  if (!form.summary.trim()) throw new Error("先写清楚为什么值得发")
  await updateAimWorkflowStatus(generationId, {
    decisionSnapshot: {
      summary: form.summary.trim(),
      targetUser: form.targetUser?.trim(),
      expectedSignal: form.expectedSignal?.trim(),
      confidence: form.confidence?.trim(),
    },
  })
  toast.success("已记下发布前判断")
}

async function savePublishRecord(generationId: string, form: PublishRecordForm, messages: AimWorkbenchMessage[]) {
  await updateAimWorkflowStatus(generationId, {
    workflowStatus: "published",
    publishPlatform: form.publishPlatform.trim() || "抖音",
    publishUrl: form.publishUrl.trim(),
  })
  const message = messages.find((item) => item.deliverables?.id === generationId)
  reportAimRunEvent(message?.runId, "accepted", { workflowStatus: "published" })
  toast.success("已登记发布")
}

function buildRetroOutcome(form: OutcomeForm, window: OutcomeWindow, platform: string) {
  if (!Object.values(form).some((value) => value?.trim())) return undefined
  return {
    collectWindowDay: Number(window) as 7 | 14 | 30,
    platform: platform.trim() || undefined,
    dmCount: parseAimOutcomeNumber(form, "dmCount"),
    qualifiedLeadCount: parseAimOutcomeNumber(form, "qualifiedLeadCount"),
    appointmentCount: parseAimOutcomeNumber(form, "appointmentCount"),
    dealCount: parseAimOutcomeNumber(form, "dealCount"),
    revenue: parseAimOutcomeNumber(form, "revenue"),
    views: parseAimOutcomeNumber(form, "views"),
    saves: parseAimOutcomeNumber(form, "saves"),
    comments: parseAimOutcomeNumber(form, "comments"),
    shares: parseAimOutcomeNumber(form, "shares"),
    audienceFeedback: form.audienceFeedback?.trim() || undefined,
  }
}

async function saveRetroRecord(input: {
  generationId: string
  retroForm: AimRetroSnapshot
  ruleForm: AimCalibrationRule
  outcomeForm: OutcomeForm
  outcomeWindow: OutcomeWindow
  publishForm: PublishRecordForm
}) {
  if (!input.retroForm.summary.trim()) throw new Error("先写清楚这次结果怎么判断")
  await updateAimWorkflowStatus(input.generationId, {
    retroSnapshot: {
      summary: input.retroForm.summary.trim(),
      actualData: input.retroForm.actualData?.trim(),
      verdict: input.retroForm.verdict?.trim(),
      nextRule: input.retroForm.nextRule?.trim(),
    },
    calibrationRule: input.ruleForm.rule.trim()
      ? { rule: input.ruleForm.rule.trim(), source: input.ruleForm.source?.trim() || "内容复盘" }
      : undefined,
    retroOutcome: buildRetroOutcome(input.outcomeForm, input.outcomeWindow, input.publishForm.publishPlatform),
  })
  toast.success("已保存复盘")
}

interface RecordForms {
  decisionForm: AimDecisionSnapshot
  setDecisionForm: Dispatch<SetStateAction<AimDecisionSnapshot>>
  publishForm: PublishRecordForm
  setPublishForm: Dispatch<SetStateAction<PublishRecordForm>>
  retroForm: AimRetroSnapshot
  setRetroForm: Dispatch<SetStateAction<AimRetroSnapshot>>
  outcomeForm: OutcomeForm
  setOutcomeForm: Dispatch<SetStateAction<OutcomeForm>>
  outcomeWindow: OutcomeWindow
  setOutcomeWindow: Dispatch<SetStateAction<OutcomeWindow>>
  retroRuleForm: AimCalibrationRule
  setRetroRuleForm: Dispatch<SetStateAction<AimCalibrationRule>>
}

function useAimRecordForms(): RecordForms {
  const [decisionForm, setDecisionForm] = useState<AimDecisionSnapshot>(EMPTY_DECISION)
  const [publishForm, setPublishForm] = useState<PublishRecordForm>(EMPTY_PUBLISH)
  const [retroForm, setRetroForm] = useState<AimRetroSnapshot>(EMPTY_RETRO)
  const [outcomeForm, setOutcomeForm] = useState<OutcomeForm>({})
  const [outcomeWindow, setOutcomeWindow] = useState<OutcomeWindow>("7")
  const [retroRuleForm, setRetroRuleForm] = useState<AimCalibrationRule>(EMPTY_RULE)
  return { decisionForm, setDecisionForm, publishForm, setPublishForm, retroForm, setRetroForm, outcomeForm, setOutcomeForm, outcomeWindow, setOutcomeWindow, retroRuleForm, setRetroRuleForm }
}

function resetFormForMode(mode: WorkflowRecordMode, taskSpec: TaskSpec | null | undefined, forms: RecordForms) {
  if (mode === "decision") {
    forms.setDecisionForm({
      summary: taskSpec?.realProblem || taskSpec?.goal || "",
      targetUser: taskSpec?.targetCustomer || "",
      expectedSignal: taskSpec?.desiredAction || "",
      confidence: taskSpec?.riskLevel === "high" ? "低" : taskSpec?.riskLevel === "medium" ? "中" : "高",
    })
  } else if (mode === "publish") {
    forms.setPublishForm(EMPTY_PUBLISH)
  } else {
    forms.setRetroForm(EMPTY_RETRO)
    forms.setRetroRuleForm(EMPTY_RULE)
    forms.setOutcomeForm({})
    forms.setOutcomeWindow("7")
  }
}

interface UseAimWorkflowRecordsInput {
  messages: AimWorkbenchMessage[]
  selectedAgentId: AimAgentId
  selectedProjectId: string
  refreshHistory: (options: { force: boolean; agentId: AimAgentId }) => Promise<void>
  refreshProjectWorkflow: () => Promise<void>
  onPublished?: (generationId: string) => void
}

/**
 * @description React Hook：aimworkflowrecords
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimWorkflowRecords(input: UseAimWorkflowRecordsInput) {
  const forms = useAimRecordForms()
  const [recordDialog, setRecordDialog] = useState<WorkflowRecordDialogState | null>(null)
  const refreshRecords = useCallback(() => {
    void input.refreshHistory({ force: true, agentId: input.selectedAgentId })
    if (input.selectedProjectId) void input.refreshProjectWorkflow()
  }, [input])
  const handleMarkStatus = useCallback((messageId: string) => async (status: string) => {
    const message = input.messages.find((item) => item.id === messageId)
    const deliverable = message?.deliverables
    if (!deliverable?.id || deliverable.id.startsWith("polish-")) return toast.error("只有已保存的内容才能推进状态")
    try {
      await updateAimWorkflowStatus(deliverable.id, { workflowStatus: status })
      if (ACCEPTED_WORKFLOW_STATUSES.has(status)) reportAimRunEvent(message?.runId, "accepted", { workflowStatus: status })
      refreshRecords()
      toast.success(`已标记为：${getAimWorkflowStatusLabel(status)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败")
    }
  }, [input.messages, refreshRecords])
  const openRecordDialog = useCallback((messageId: string, mode: WorkflowRecordMode) => {
    const deliverable = input.messages.find((message) => message.id === messageId)?.deliverables
    if (!deliverable?.id || deliverable.id.startsWith("polish-")) return toast.error("只有已保存的内容才能记录")
    resetFormForMode(mode, deliverable.taskSpec, forms)
    setRecordDialog({ mode, generationId: deliverable.id })
  }, [forms, input.messages])
  const submitRecordDialog = useCallback(async () => {
    if (!recordDialog) return
    try {
      if (recordDialog.mode === "decision") await saveDecisionRecord(recordDialog.generationId, forms.decisionForm)
      else if (recordDialog.mode === "publish") {
        await savePublishRecord(recordDialog.generationId, forms.publishForm, input.messages)
        input.onPublished?.(recordDialog.generationId)
      }
      else await saveRetroRecord({
        generationId: recordDialog.generationId,
        retroForm: forms.retroForm,
        ruleForm: forms.retroRuleForm,
        outcomeForm: forms.outcomeForm,
        outcomeWindow: forms.outcomeWindow,
        publishForm: forms.publishForm,
      })
      setRecordDialog(null)
      refreshRecords()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }, [forms, input, recordDialog, refreshRecords])
  return { recordDialog, closeRecordDialog: () => setRecordDialog(null), ...forms, handleMarkStatus, openRecordDialog, submitRecordDialog }
}
