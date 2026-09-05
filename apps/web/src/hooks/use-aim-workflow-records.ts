"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"

import type {
  LeadRecordForm,
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
import { registerAimLeadAttribution } from "@/lib/api/lead-attribution"
import { importOutcomeFile } from "@/lib/api/outcome-import"
import { isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import {
  reportWebFinalDisposition,
  resolveRunWorkflowId,
} from "@/lib/aim/run-outcome-client"
import type { FinalDisposition } from "@/lib/aim/run-outcome-telemetry"
import { parseOutcomeVerdictCode } from "@/lib/aim/outcome-verdict"
import { getAimWorkflowStatusLabel } from "@/lib/aim/workbench-display"
import { patchDeliverableWorkflowFields } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { TaskSpec } from "@/lib/task-spec"

const ACCEPTED_WORKFLOW_STATUSES = new Set(["ready_to_shoot", "ready_to_publish", "published"])
const EMPTY_DECISION: AimDecisionSnapshot = { summary: "", targetUser: "", expectedSignal: "", confidence: "" }
const EMPTY_PUBLISH: PublishRecordForm = { publishPlatform: "抖音", publishUrl: "" }
const EMPTY_LEAD: LeadRecordForm = { externalLeadId: "", externalDealId: "", externalPaymentId: "" }
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

/** 导出供单测复用：强制点①客户端前置校验 */
export async function savePublishRecord(
  generationId: string,
  form: PublishRecordForm,
  setMessages?: Dispatch<SetStateAction<AimWorkbenchMessage[]>>,
) {
  const publishPlatform = form.publishPlatform.trim() || "抖音"
  if (!publishPlatform) throw new Error("请填写发布平台")
  const publishUrl = form.publishUrl.trim()
  // 强制点①：进入已发布必须挂作品键（链接或作品 ID），否则经营归因链断裂
  if (!publishUrl) throw new Error("请填写作品链接或作品 ID（用于经营归因）")
  // 先进入待发布（状态机合法路径），再登记已发布
  try {
    await updateAimWorkflowStatus(generationId, { workflowStatus: "ready_to_publish" })
  } catch {
    // 已在更后状态或同态时忽略，下一步会再校验
  }
  await updateAimWorkflowStatus(generationId, {
    workflowStatus: "published",
    publishPlatform,
    publishUrl,
  })
  setMessages?.((current) => patchDeliverableWorkflowFields(current, generationId, {
    workflowStatus: "published",
    publishPlatform,
    publishUrl,
  }))
}

/** 导出供单测复用：强制点②客户端前置校验 */
export async function saveLeadRecord(generationId: string, form: LeadRecordForm) {
  const externalLeadId = form.externalLeadId.trim()
  // 强制点②：线索必须显式挂来源；不确定来源就不登记（运营侧兜底为 unknown）
  if (!externalLeadId) throw new Error("请填写线索标识（微信号 / 手机号 / 线索编号）")
  await registerAimLeadAttribution({
    generationId,
    externalLeadId,
    externalDealId: form.externalDealId.trim() || undefined,
    externalPaymentId: form.externalPaymentId.trim() || undefined,
  })
  toast.success("已登记线索归因")
}

/** 导出供单测复用：复盘表格导入（识别到的指标直接写入该内容的发布数据） */
export async function saveOutcomeImport(generationId: string, file: File) {
  const result = await importOutcomeFile({ generationId, file })
  toast.success(result.summary)
  return result
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
    verdictCode: parseOutcomeVerdictCode(form.verdictCode) ?? undefined,
    verdictNote: form.verdictNote?.trim() || undefined,
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
  leadForm: LeadRecordForm
  setLeadForm: Dispatch<SetStateAction<LeadRecordForm>>
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
  const [leadForm, setLeadForm] = useState<LeadRecordForm>(EMPTY_LEAD)
  const [outcomeForm, setOutcomeForm] = useState<OutcomeForm>({})
  const [outcomeWindow, setOutcomeWindow] = useState<OutcomeWindow>("7")
  const [retroRuleForm, setRetroRuleForm] = useState<AimCalibrationRule>(EMPTY_RULE)
  return { decisionForm, setDecisionForm, publishForm, setPublishForm, retroForm, setRetroForm, leadForm, setLeadForm, outcomeForm, setOutcomeForm, outcomeWindow, setOutcomeWindow, retroRuleForm, setRetroRuleForm }
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
  } else if (mode === "lead") {
    forms.setLeadForm(EMPTY_LEAD)
  } else {
    forms.setRetroForm(EMPTY_RETRO)
    forms.setRetroRuleForm(EMPTY_RULE)
    forms.setOutcomeForm({})
    forms.setOutcomeWindow("7")
  }
}

interface UseAimWorkflowRecordsInput {
  messages: AimWorkbenchMessage[]
  setMessages?: Dispatch<SetStateAction<AimWorkbenchMessage[]>>
  selectedAgentId: AimAgentId
  selectedProjectId: string
  refreshHistory: (options?: { projectId?: string; agentId?: string; force?: boolean }) => Promise<void>
  refreshProjectWorkflow: () => Promise<void>
  onPublished?: (generationId: string) => void
}

function useRecordDialogHandlers(input: {
  workflow: UseAimWorkflowRecordsInput
  forms: RecordForms
  recordDialog: WorkflowRecordDialogState | null
  setRecordDialog: Dispatch<SetStateAction<WorkflowRecordDialogState | null>>
  refreshRecords: () => void
  reportMessageOutcome: (
    message: AimWorkbenchMessage | undefined,
    finalDisposition: FinalDisposition,
  ) => Promise<void>
}) {
  const [outcomeImporting, setOutcomeImporting] = useState(false)
  const openRecordDialog = useCallback((messageId: string, mode: WorkflowRecordMode) => {
    const deliverable = input.workflow.messages.find((message) => message.id === messageId)?.deliverables
    if (!deliverable?.id || deliverable.id.startsWith("polish-")) return toast.error("只有已保存的内容才能记录")
    resetFormForMode(mode, deliverable.taskSpec, input.forms)
    input.setRecordDialog({ mode, generationId: deliverable.id })
  }, [input])
  const submitRecordDialog = useCallback(async () => {
    const dialog = input.recordDialog
    if (!dialog) return
    try {
      if (dialog.mode === "decision") {
        await saveDecisionRecord(dialog.generationId, input.forms.decisionForm)
      } else if (dialog.mode === "publish") {
        await savePublishRecord(dialog.generationId, input.forms.publishForm, input.workflow.setMessages)
        try {
          await input.reportMessageOutcome(
            input.workflow.messages.find((message) => message.deliverables?.id === dialog.generationId),
            "accepted_first_pass",
          )
        } catch {
          toast.error("已登记发布，但经营结果记录失败，请重试")
          return
        }
        toast.success("已登记发布")
        input.workflow.onPublished?.(dialog.generationId)
      } else if (dialog.mode === "lead") {
        await saveLeadRecord(dialog.generationId, input.forms.leadForm)
      } else {
        await saveRetroRecord({
          generationId: dialog.generationId,
          retroForm: input.forms.retroForm,
          ruleForm: input.forms.retroRuleForm,
          outcomeForm: input.forms.outcomeForm,
          outcomeWindow: input.forms.outcomeWindow,
          publishForm: input.forms.publishForm,
        })
      }
      input.setRecordDialog(null)
      input.refreshRecords()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }, [input])
  /** 复盘对话框内上传平台导出表格：写入成功后刷新记录，失败如实 toast */
  const uploadOutcomeFile = useCallback(async (file: File) => {
    if (!input.recordDialog) return toast.error("请先选择要复盘的内容")
    setOutcomeImporting(true)
    try {
      await saveOutcomeImport(input.recordDialog.generationId, file)
      input.refreshRecords()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "表格导入失败")
    } finally {
      setOutcomeImporting(false)
    }
  }, [input])
  return { openRecordDialog, submitRecordDialog, uploadOutcomeFile, outcomeImporting }
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
    void input.refreshHistory({ force: true })
    if (input.selectedProjectId) void input.refreshProjectWorkflow()
  }, [input])
  const reportMessageOutcome = useCallback(async (
    message: AimWorkbenchMessage | undefined,
    finalDisposition: FinalDisposition,
  ) => {
    await reportWebFinalDisposition({
      runId: message?.runId,
      workflowId: resolveRunWorkflowId(
        isValidAimAgent(message?.agentId) ? message.agentId : input.selectedAgentId,
      ),
      taskType: message?.contentAction ?? "generation",
      finalDisposition,
    })
  }, [input.selectedAgentId])
  const handleMarkStatus = useCallback((messageId: string) => async (status: string) => {
    const message = input.messages.find((item) => item.id === messageId)
    const deliverable = message?.deliverables
    if (!deliverable?.id || deliverable.id.startsWith("polish-")) return toast.error("只有已保存的内容才能推进状态")
    try {
      await updateAimWorkflowStatus(deliverable.id, { workflowStatus: status })
      input.setMessages?.((current) => patchDeliverableWorkflowFields(current, deliverable.id, {
        workflowStatus: status,
      }))
      if (ACCEPTED_WORKFLOW_STATUSES.has(status)) {
        try {
          await reportMessageOutcome(message, "accepted_first_pass")
        } catch {
          refreshRecords()
          toast.error("状态已更新，但经营结果记录失败，请重试")
          return
        }
      }
      refreshRecords()
      toast.success(`已标记为：${getAimWorkflowStatusLabel(status)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败")
    }
  }, [input, refreshRecords, reportMessageOutcome])
  const handleFinalDisposition = useCallback(
    (messageId: string) => async (finalDisposition: FinalDisposition) => {
      try {
        await reportMessageOutcome(
          input.messages.find((message) => message.id === messageId),
          finalDisposition,
        )
        toast.success("经营结果已记录")
      } catch {
        toast.error("经营结果记录失败，请重试")
      }
    },
    [input.messages, reportMessageOutcome],
  )
  const { openRecordDialog, submitRecordDialog, uploadOutcomeFile, outcomeImporting } = useRecordDialogHandlers({
    workflow: input,
    forms,
    recordDialog,
    setRecordDialog,
    refreshRecords,
    reportMessageOutcome,
  })
  return {
    recordDialog,
    closeRecordDialog: () => setRecordDialog(null),
    ...forms,
    handleMarkStatus,
    handleFinalDisposition,
    openRecordDialog,
    submitRecordDialog,
    uploadOutcomeFile,
    outcomeImporting,
  }
}
