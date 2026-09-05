"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AimCalibrationRule, AimDecisionSnapshot, AimRetroSnapshot } from "@/lib/api/client"

export type WorkflowRecordMode = "decision" | "publish" | "retro" | "lead"
export interface WorkflowRecordDialogState { mode: WorkflowRecordMode; generationId: string }
export interface PublishRecordForm { publishPlatform: string; publishUrl: string }
export interface LeadRecordForm { externalLeadId: string; externalDealId: string; externalPaymentId: string }
export type OutcomeWindow = "7" | "14" | "30"
export type OutcomeForm = Record<string, string>

function DecisionFields({ form, onChange }: { form: AimDecisionSnapshot; onChange: (form: AimDecisionSnapshot) => void }) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><p className="text-sm font-medium">这条为什么值得发</p><Textarea value={form.summary} onChange={(event) => onChange({ ...form, summary: event.target.value })} placeholder="比如：这条不是讲工具，而是帮新手解决不知道从哪开始的问题。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">最可能打中的人</p><Input value={form.targetUser ?? ""} onChange={(event) => onChange({ ...form, targetUser: event.target.value })} placeholder="比如：刚开始做 AI 内容、但没有判断标准的人。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">发完最想验证什么</p><Textarea value={form.expectedSignal ?? ""} onChange={(event) => onChange({ ...form, expectedSignal: event.target.value })} placeholder="比如：收藏率、评论里有没有人追问工具链、是否能带出下一条选题。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">当前把握</p><Input value={form.confidence ?? ""} onChange={(event) => onChange({ ...form, confidence: event.target.value })} placeholder="比如：7/10，题对了，但开头还不够硬。" /></div>
  </div>
}

function PublishFields({ form, onChange }: { form: PublishRecordForm; onChange: (form: PublishRecordForm) => void }) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><p className="text-sm font-medium">发布平台</p><Input value={form.publishPlatform} onChange={(event) => onChange({ ...form, publishPlatform: event.target.value })} placeholder="抖音 / 小红书 / 视频号" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">作品链接或作品 ID（必填）</p><Input value={form.publishUrl} onChange={(event) => onChange({ ...form, publishUrl: event.target.value })} placeholder="粘贴发布后的链接或作品 ID，用于经营归因" /></div>
  </div>
}

function LeadFields({ form, onChange }: { form: LeadRecordForm; onChange: (form: LeadRecordForm) => void }) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><p className="text-sm font-medium">线索标识（必填）</p><Input value={form.externalLeadId} onChange={(event) => onChange({ ...form, externalLeadId: event.target.value })} placeholder="微信号 / 手机号 / 线索编号" /><p className="text-xs text-muted-foreground">来源自动挂到本条内容；不确定来源就不要挂。同一线索重复登记会合并不重复计数。</p></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="space-y-1.5"><p className="text-sm font-medium">成交记录编号（选填）</p><Input value={form.externalDealId} onChange={(event) => onChange({ ...form, externalDealId: event.target.value })} placeholder="已成交才填" /></div>
      <div className="space-y-1.5"><p className="text-sm font-medium">回款记录编号（选填）</p><Input value={form.externalPaymentId} onChange={(event) => onChange({ ...form, externalPaymentId: event.target.value })} placeholder="已回款才填" /></div>
    </div>
  </div>
}

const CORE_OUTCOME_FIELDS = [
  ["dmCount", "有效私信"], ["qualifiedLeadCount", "合格线索"], ["dealCount", "成交"], ["revenue", "营收(元)"],
] as const

const MORE_OUTCOME_FIELDS = [
  ["appointmentCount", "预约咨询"], ["views", "播放"], ["saves", "收藏"], ["comments", "评论"], ["shares", "转发"],
] as const

function OutcomeInputs({ fields, form, onChange }: {
  fields: ReadonlyArray<readonly [string, string]>
  form: OutcomeForm
  onChange: (form: OutcomeForm) => void
}) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{fields.map(([key, label]) => <label key={key} className="flex flex-col gap-0.5"><span className="text-[11px] text-muted-foreground">{label}</span><input inputMode="numeric" value={form[key] ?? ""} onChange={(event) => onChange({ ...form, [key]: event.target.value })} placeholder="—" className="h-8 rounded border border-border/60 bg-background px-2 text-sm" /></label>)}</div>
}

function OutcomeFields({ form, window, onChange, onWindowChange }: {
  form: OutcomeForm
  window: OutcomeWindow
  onChange: (form: OutcomeForm) => void
  onWindowChange: (window: OutcomeWindow) => void
}) {
  return <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
    <div className="flex items-center justify-between"><p className="text-sm font-medium">结构化结果（选填，未填不计为 0）</p><select value={window} onChange={(event) => onWindowChange(event.target.value as OutcomeWindow)} className="h-7 rounded border border-border/60 bg-background px-2 text-xs"><option value="7">7 天</option><option value="14">14 天</option><option value="30">30 天</option></select></div>
    <OutcomeInputs fields={CORE_OUTCOME_FIELDS} form={form} onChange={onChange} />
    <details className="rounded-md border border-border/50 bg-background px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">更多数据</summary>
      <div className="mt-3 space-y-3">
        <OutcomeInputs fields={MORE_OUTCOME_FIELDS} form={form} onChange={onChange} />
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">结果判断</span>
          <select value={form.verdictCode ?? ""} onChange={(event) => onChange({ ...form, verdictCode: event.target.value })} className="h-8 rounded border border-border/60 bg-background px-2 text-sm">
            <option value="">未判断</option>
            <option value="excellent">优秀</option>
            <option value="effective">有效</option>
            <option value="neutral">中性</option>
            <option value="ineffective">无效</option>
            <option value="failed">失败</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">判断备注</span>
          <Textarea value={form.verdictNote ?? ""} onChange={(event) => onChange({ ...form, verdictNote: event.target.value })} placeholder="记录为什么有效或无效；备注不会自动改变判断码。" className="min-h-[60px]" />
        </label>
        <label className="flex flex-col gap-0.5"><span className="text-[11px] text-muted-foreground">用户反馈（哪类人在问 / 是否目标客户原话 / 是否带来错误人群）</span><Textarea value={form.audienceFeedback ?? ""} onChange={(event) => onChange({ ...form, audienceFeedback: event.target.value })} placeholder="把评论区/私信里真实出现的话记下来。" className="min-h-[60px]" /></label>
      </div>
    </details>
  </div>
}

function OutcomeImportRow({ onUpload, uploading }: { onUpload?: (file: File) => void; uploading?: boolean }) {
  if (!onUpload) return null
  return <div className="flex flex-wrap items-center gap-2">
    <input
      id="aim-outcome-import-file"
      type="file"
      accept=".xlsx,.xls,.csv"
      className="hidden"
      disabled={uploading}
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (file) onUpload(file)
      }}
    />
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={uploading}
      onClick={() => document.getElementById("aim-outcome-import-file")?.click()}
    >
      {uploading ? "导入中…" : "上传平台导出表格"}
    </Button>
    <span className="text-xs text-muted-foreground">xlsx / csv；识别到的指标直接登记为该内容的发布数据，未识别的不写入</span>
  </div>
}

function RetroFields({ form, rule, outcome, outcomeWindow, onChange, onRuleChange, onOutcomeChange, onOutcomeWindowChange, onFileUpload, uploading }: {
  form: AimRetroSnapshot
  rule: AimCalibrationRule
  outcome: OutcomeForm
  outcomeWindow: OutcomeWindow
  onChange: (form: AimRetroSnapshot) => void
  onRuleChange: (form: AimCalibrationRule) => void
  onOutcomeChange: (form: OutcomeForm) => void
  onOutcomeWindowChange: (window: OutcomeWindow) => void
  onFileUpload?: (file: File) => void
  uploading?: boolean
}) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><p className="text-sm font-medium">这次结果怎么判断</p><Textarea value={form.summary} onChange={(event) => onChange({ ...form, summary: event.target.value })} placeholder="比如：播放一般，但收藏和私信明显高，说明题不破圈，但很能打中目标人。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">实际数据或反馈</p><Textarea value={form.actualData ?? ""} onChange={(event) => onChange({ ...form, actualData: event.target.value })} placeholder="写播放、点赞、收藏、评论、私信，或者用户原话。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">这次判断哪里对，哪里错</p><Textarea value={form.verdict ?? ""} onChange={(event) => onChange({ ...form, verdict: event.target.value })} placeholder="比如：判断对在痛点，判断错在标题太像教程合集。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">下次同类内容怎么判断</p><Textarea value={rule.rule} onChange={(event) => onRuleChange({ ...rule, rule: event.target.value })} placeholder="比如：工具类长教程先看能不能压成一个明确场景，否则不做大而全。" /></div>
    <OutcomeFields form={outcome} window={outcomeWindow} onChange={onOutcomeChange} onWindowChange={onOutcomeWindowChange} />
    <OutcomeImportRow onUpload={onFileUpload} uploading={uploading} />
  </div>
}

const DIALOG_COPY = {
  decision: { title: "发布前判断", description: "把这条为什么发、准备打到谁、想验证什么先记下来。" },
  publish: { title: "登记发布", description: "记录发到哪个平台、作品链接在哪；没有链接就先别标记已发布。" },
  retro: { title: "填写复盘", description: "只写结果判断和下次同类内容的判断规则。" },
  lead: { title: "登记线索", description: "把新加微/进线的线索挂到本条内容做经营归因。" },
}

/**
 * @description 获取workflowrecorddialogcopy
 * @param mode? - mode?
 * @returns 无返回值
 */
export function getWorkflowRecordDialogCopy(mode?: WorkflowRecordMode) {
  return mode ? DIALOG_COPY[mode] : DIALOG_COPY.retro
}

/**
 * @description workflowrecordfields
 * @param props - 组件属性
 * @returns 无返回值
 */
export function WorkflowRecordFields(props: Pick<WorkflowRecordDialogProps, "dialog" | "decisionForm" | "publishForm" | "retroForm" | "ruleForm" | "leadForm" | "outcomeForm" | "outcomeWindow" | "onDecisionChange" | "onPublishChange" | "onRetroChange" | "onRuleChange" | "onLeadChange" | "onOutcomeChange" | "onOutcomeWindowChange" | "onOutcomeFileUpload" | "outcomeImporting">) {
  const mode = props.dialog?.mode
  return <>
    {mode === "decision" ? <DecisionFields form={props.decisionForm} onChange={props.onDecisionChange} /> : null}
    {mode === "publish" ? <PublishFields form={props.publishForm} onChange={props.onPublishChange} /> : null}
    {mode === "retro" ? <RetroFields form={props.retroForm} rule={props.ruleForm} outcome={props.outcomeForm} outcomeWindow={props.outcomeWindow} onChange={props.onRetroChange} onRuleChange={props.onRuleChange} onOutcomeChange={props.onOutcomeChange} onOutcomeWindowChange={props.onOutcomeWindowChange} onFileUpload={props.onOutcomeFileUpload} uploading={props.outcomeImporting} /> : null}
    {mode === "lead" ? <LeadFields form={props.leadForm} onChange={props.onLeadChange} /> : null}
  </>
}

interface WorkflowRecordDialogProps {
  dialog: WorkflowRecordDialogState | null
  busy: boolean
  decisionForm: AimDecisionSnapshot
  publishForm: PublishRecordForm
  retroForm: AimRetroSnapshot
  ruleForm: AimCalibrationRule
  leadForm: LeadRecordForm
  outcomeForm: OutcomeForm
  outcomeWindow: OutcomeWindow
  onDecisionChange: (form: AimDecisionSnapshot) => void
  onPublishChange: (form: PublishRecordForm) => void
  onRetroChange: (form: AimRetroSnapshot) => void
  onRuleChange: (form: AimCalibrationRule) => void
  onLeadChange: (form: LeadRecordForm) => void
  onOutcomeChange: (form: OutcomeForm) => void
  onOutcomeWindowChange: (window: OutcomeWindow) => void
  onOutcomeFileUpload?: (file: File) => void
  outcomeImporting?: boolean
  onClose: () => void
  onSubmit: () => void
}

/**
 * @description workflowrecorddialog
 * @param props - 组件属性
 * @returns 无返回值
 */
export function WorkflowRecordDialog(props: WorkflowRecordDialogProps) {
  const mode = props.dialog?.mode
  const copy = getWorkflowRecordDialogCopy(mode)
  return <Dialog open={!!props.dialog} onOpenChange={(open) => { if (!open) props.onClose() }}><DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.description}</DialogDescription></DialogHeader>
    <WorkflowRecordFields {...props} />
    <DialogFooter><Button variant="outline" onClick={props.onClose}>取消</Button><Button onClick={props.onSubmit} disabled={props.busy}>保存</Button></DialogFooter>
  </DialogContent></Dialog>
}
