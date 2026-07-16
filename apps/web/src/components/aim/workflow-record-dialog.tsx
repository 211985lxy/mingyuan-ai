"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AimCalibrationRule, AimDecisionSnapshot, AimRetroSnapshot } from "@/lib/api/client"

export type WorkflowRecordMode = "decision" | "publish" | "retro"
export interface WorkflowRecordDialogState { mode: WorkflowRecordMode; generationId: string }
export interface PublishRecordForm { publishPlatform: string; publishUrl: string }
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
    <div className="space-y-1.5"><p className="text-sm font-medium">内容链接</p><Input value={form.publishUrl} onChange={(event) => onChange({ ...form, publishUrl: event.target.value })} placeholder="粘贴发布后的链接，没有可先留空。" /></div>
  </div>
}

const OUTCOME_FIELDS = [
  ["dmCount", "有效私信"], ["qualifiedLeadCount", "合格线索"], ["appointmentCount", "预约咨询"],
  ["dealCount", "成交"], ["revenue", "营收(元)"], ["views", "播放"], ["saves", "收藏"],
  ["comments", "评论"], ["shares", "转发"],
] as const

function OutcomeFields({ form, window, onChange, onWindowChange }: {
  form: OutcomeForm
  window: OutcomeWindow
  onChange: (form: OutcomeForm) => void
  onWindowChange: (window: OutcomeWindow) => void
}) {
  return <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
    <div className="flex items-center justify-between"><p className="text-sm font-medium">结构化结果（选填，未填不计为 0）</p><select value={window} onChange={(event) => onWindowChange(event.target.value as OutcomeWindow)} className="h-7 rounded border border-border/60 bg-background px-2 text-xs"><option value="7">7 天</option><option value="14">14 天</option><option value="30">30 天</option></select></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{OUTCOME_FIELDS.map(([key, label]) => <label key={key} className="flex flex-col gap-0.5"><span className="text-[11px] text-muted-foreground">{label}</span><input inputMode="numeric" value={form[key] ?? ""} onChange={(event) => onChange({ ...form, [key]: event.target.value })} placeholder="—" className="h-8 rounded border border-border/60 bg-background px-2 text-sm" /></label>)}</div>
    <label className="flex flex-col gap-0.5"><span className="text-[11px] text-muted-foreground">用户反馈（哪类人在问 / 是否目标客户原话 / 是否带来错误人群）</span><Textarea value={form.audienceFeedback ?? ""} onChange={(event) => onChange({ ...form, audienceFeedback: event.target.value })} placeholder="把评论区/私信里真实出现的话记下来。" className="min-h-[60px]" /></label>
  </div>
}

function RetroFields({ form, rule, outcome, outcomeWindow, onChange, onRuleChange, onOutcomeChange, onOutcomeWindowChange }: {
  form: AimRetroSnapshot
  rule: AimCalibrationRule
  outcome: OutcomeForm
  outcomeWindow: OutcomeWindow
  onChange: (form: AimRetroSnapshot) => void
  onRuleChange: (form: AimCalibrationRule) => void
  onOutcomeChange: (form: OutcomeForm) => void
  onOutcomeWindowChange: (window: OutcomeWindow) => void
}) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><p className="text-sm font-medium">这次结果怎么判断</p><Textarea value={form.summary} onChange={(event) => onChange({ ...form, summary: event.target.value })} placeholder="比如：播放一般，但收藏和私信明显高，说明题不破圈，但很能打中目标人。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">实际数据或反馈</p><Textarea value={form.actualData ?? ""} onChange={(event) => onChange({ ...form, actualData: event.target.value })} placeholder="写播放、点赞、收藏、评论、私信，或者用户原话。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">这次判断哪里对，哪里错</p><Textarea value={form.verdict ?? ""} onChange={(event) => onChange({ ...form, verdict: event.target.value })} placeholder="比如：判断对在痛点，判断错在标题太像教程合集。" /></div>
    <div className="space-y-1.5"><p className="text-sm font-medium">下次同类内容怎么判断</p><Textarea value={rule.rule} onChange={(event) => onRuleChange({ ...rule, rule: event.target.value })} placeholder="比如：工具类长教程先看能不能压成一个明确场景，否则不做大而全。" /></div>
    <OutcomeFields form={outcome} window={outcomeWindow} onChange={onOutcomeChange} onWindowChange={onOutcomeWindowChange} />
  </div>
}

const DIALOG_COPY = {
  decision: { title: "发布前判断", description: "把这条为什么发、准备打到谁、想验证什么先记下来。" },
  publish: { title: "登记发布", description: "记录发到哪个平台，顺手把状态推进到已发布。" },
  retro: { title: "填写复盘", description: "只写结果判断和下次同类内容的判断规则。" },
}

export function getWorkflowRecordDialogCopy(mode?: WorkflowRecordMode) {
  return mode ? DIALOG_COPY[mode] : DIALOG_COPY.retro
}

export function WorkflowRecordFields(props: Pick<WorkflowRecordDialogProps, "dialog" | "decisionForm" | "publishForm" | "retroForm" | "ruleForm" | "outcomeForm" | "outcomeWindow" | "onDecisionChange" | "onPublishChange" | "onRetroChange" | "onRuleChange" | "onOutcomeChange" | "onOutcomeWindowChange">) {
  const mode = props.dialog?.mode
  return <>
    {mode === "decision" ? <DecisionFields form={props.decisionForm} onChange={props.onDecisionChange} /> : null}
    {mode === "publish" ? <PublishFields form={props.publishForm} onChange={props.onPublishChange} /> : null}
    {mode === "retro" ? <RetroFields form={props.retroForm} rule={props.ruleForm} outcome={props.outcomeForm} outcomeWindow={props.outcomeWindow} onChange={props.onRetroChange} onRuleChange={props.onRuleChange} onOutcomeChange={props.onOutcomeChange} onOutcomeWindowChange={props.onOutcomeWindowChange} /> : null}
  </>
}

interface WorkflowRecordDialogProps {
  dialog: WorkflowRecordDialogState | null
  busy: boolean
  decisionForm: AimDecisionSnapshot
  publishForm: PublishRecordForm
  retroForm: AimRetroSnapshot
  ruleForm: AimCalibrationRule
  outcomeForm: OutcomeForm
  outcomeWindow: OutcomeWindow
  onDecisionChange: (form: AimDecisionSnapshot) => void
  onPublishChange: (form: PublishRecordForm) => void
  onRetroChange: (form: AimRetroSnapshot) => void
  onRuleChange: (form: AimCalibrationRule) => void
  onOutcomeChange: (form: OutcomeForm) => void
  onOutcomeWindowChange: (window: OutcomeWindow) => void
  onClose: () => void
  onSubmit: () => void
}

export function WorkflowRecordDialog(props: WorkflowRecordDialogProps) {
  const mode = props.dialog?.mode
  const copy = getWorkflowRecordDialogCopy(mode)
  return <Dialog open={!!props.dialog} onOpenChange={(open) => { if (!open) props.onClose() }}><DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.description}</DialogDescription></DialogHeader>
    <WorkflowRecordFields {...props} />
    <DialogFooter><Button variant="outline" onClick={props.onClose}>取消</Button><Button onClick={props.onSubmit} disabled={props.busy}>保存</Button></DialogFooter>
  </DialogContent></Dialog>
}
