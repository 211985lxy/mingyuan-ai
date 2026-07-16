import type { Dispatch, SetStateAction } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AimCalibrationRule, AimDecisionSnapshot, AimRetroSnapshot } from "@/lib/api/client"
import type { RecordDialogState } from "@/features/aim/aim-workbench-types"

interface AimRecordDialogProps {
  recordDialog: RecordDialogState | null
  decisionForm: AimDecisionSnapshot
  publishForm: { publishPlatform: string; publishUrl: string }
  retroForm: AimRetroSnapshot
  retroRuleForm: AimCalibrationRule
  outcomeForm: Record<string, string>
  outcomeWindow: "7" | "14" | "30"
  busy: boolean
  setRecordDialog: Dispatch<SetStateAction<RecordDialogState | null>>
  setDecisionForm: Dispatch<SetStateAction<AimDecisionSnapshot>>
  setPublishForm: Dispatch<SetStateAction<{ publishPlatform: string; publishUrl: string }>>
  setRetroForm: Dispatch<SetStateAction<AimRetroSnapshot>>
  setRetroRuleForm: Dispatch<SetStateAction<AimCalibrationRule>>
  setOutcomeForm: Dispatch<SetStateAction<Record<string, string>>>
  setOutcomeWindow: Dispatch<SetStateAction<"7" | "14" | "30">>
  onSubmit: () => void
}

export function AimRecordDialog({
  recordDialog,
  decisionForm,
  publishForm,
  retroForm,
  retroRuleForm,
  outcomeForm,
  outcomeWindow,
  busy,
  setRecordDialog,
  setDecisionForm,
  setPublishForm,
  setRetroForm,
  setRetroRuleForm,
  setOutcomeForm,
  setOutcomeWindow,
  onSubmit,
}: AimRecordDialogProps) {
  return (
    <Dialog open={!!recordDialog} onOpenChange={(open) => { if (!open) setRecordDialog(null) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {recordDialog?.mode === "decision"
              ? "发布前判断"
              : recordDialog?.mode === "publish"
                ? "登记发布"
                : "填写复盘"}
          </DialogTitle>
          <DialogDescription>
            {recordDialog?.mode === "decision"
              ? "把这条为什么发、准备打到谁、想验证什么先记下来。"
              : recordDialog?.mode === "publish"
                ? "记录发到哪个平台，顺手把状态推进到已发布。"
                : "只写结果判断和下次同类内容的判断规则。"}
          </DialogDescription>
        </DialogHeader>

        {recordDialog?.mode === "decision" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">这条为什么值得发</p>
              <Textarea
                value={decisionForm.summary}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="比如：这条不是讲工具，而是帮新手解决不知道从哪开始的问题。"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">最可能打中的人</p>
              <Input
                value={decisionForm.targetUser ?? ""}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, targetUser: event.target.value }))}
                placeholder="比如：刚开始做 AI 内容、但没有判断标准的人。"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">发完最想验证什么</p>
              <Textarea
                value={decisionForm.expectedSignal ?? ""}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, expectedSignal: event.target.value }))}
                placeholder="比如：收藏率、评论里有没有人追问工具链、是否能带出下一条选题。"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">当前把握</p>
              <Input
                value={decisionForm.confidence ?? ""}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, confidence: event.target.value }))}
                placeholder="比如：7/10，题对了，但开头还不够硬。"
              />
            </div>
          </div>
        )}

        {recordDialog?.mode === "publish" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">发布平台</p>
              <Input
                value={publishForm.publishPlatform}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, publishPlatform: event.target.value }))}
                placeholder="抖音 / 小红书 / 视频号"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">内容链接</p>
              <Input
                value={publishForm.publishUrl}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, publishUrl: event.target.value }))}
                placeholder="粘贴发布后的链接，没有可先留空。"
              />
            </div>
          </div>
        )}

        {recordDialog?.mode === "retro" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">这次结果怎么判断</p>
              <Textarea
                value={retroForm.summary}
                onChange={(event) => setRetroForm((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="比如：播放一般，但收藏和私信明显高，说明题不破圈，但很能打中目标人。"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">实际数据或反馈</p>
              <Textarea
                value={retroForm.actualData ?? ""}
                onChange={(event) => setRetroForm((prev) => ({ ...prev, actualData: event.target.value }))}
                placeholder="写播放、点赞、收藏、评论、私信，或者用户原话。"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">这次判断哪里对，哪里错</p>
              <Textarea
                value={retroForm.verdict ?? ""}
                onChange={(event) => setRetroForm((prev) => ({ ...prev, verdict: event.target.value }))}
                placeholder="比如：判断对在痛点，判断错在标题太像教程合集。"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">下次同类内容怎么判断</p>
              <Textarea
                value={retroRuleForm.rule}
                onChange={(event) => setRetroRuleForm((prev) => ({ ...prev, rule: event.target.value }))}
                placeholder="比如：工具类长教程先看能不能压成一个明确场景，否则不做大而全。"
              />
            </div>
            <OutcomeFields
              outcomeForm={outcomeForm}
              outcomeWindow={outcomeWindow}
              setOutcomeForm={setOutcomeForm}
              setOutcomeWindow={setOutcomeWindow}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setRecordDialog(null)}>
            取消
          </Button>
          <Button onClick={() => onSubmit()} disabled={busy}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OutcomeFields({
  outcomeForm,
  outcomeWindow,
  setOutcomeForm,
  setOutcomeWindow,
}: {
  outcomeForm: Record<string, string>
  outcomeWindow: "7" | "14" | "30"
  setOutcomeForm: Dispatch<SetStateAction<Record<string, string>>>
  setOutcomeWindow: Dispatch<SetStateAction<"7" | "14" | "30">>
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">结构化结果（选填，未填不计为 0）</p>
        <select
          value={outcomeWindow}
          onChange={(e) => setOutcomeWindow(e.target.value as "7" | "14" | "30")}
          className="h-7 rounded border border-border/60 bg-background px-2 text-xs"
        >
          <option value="7">7 天</option>
          <option value="14">14 天</option>
          <option value="30">30 天</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {([
          ["dmCount", "有效私信"],
          ["qualifiedLeadCount", "合格线索"],
          ["appointmentCount", "预约咨询"],
          ["dealCount", "成交"],
          ["revenue", "营收(元)"],
          ["views", "播放"],
          ["saves", "收藏"],
          ["comments", "评论"],
          ["shares", "转发"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <input
              inputMode="numeric"
              value={outcomeForm[key] ?? ""}
              onChange={(e) => setOutcomeForm((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="—"
              className="h-8 rounded border border-border/60 bg-background px-2 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">用户反馈（哪类人在问 / 是否目标客户原话 / 是否带来错误人群）</span>
        <Textarea
          value={outcomeForm.audienceFeedback ?? ""}
          onChange={(e) => setOutcomeForm((prev) => ({ ...prev, audienceFeedback: e.target.value }))}
          placeholder="把评论区/私信里真实出现的话记下来。"
          className="min-h-[60px]"
        />
      </label>
    </div>
  )
}
