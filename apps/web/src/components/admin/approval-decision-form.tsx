"use client"

import React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type SignableSubject =
  | "generation"
  | "asset"
  | "memory"
  | "methodology"
  | "workflow_change"
type SignableRole = "reviewer" | "business_owner" | "backup_owner" | "system_owner"

function ApprovalSubjectFields(props: {
  subjectType: SignableSubject
  setSubjectType: (value: SignableSubject) => void
  subjectId: string
  setSubjectId: (value: string) => void
  workflowId: string
  setWorkflowId: (value: string) => void
  role: SignableRole
  setRole: (value: SignableRole) => void
}) {
  const dual = props.subjectType === "methodology" || props.subjectType === "workflow_change"
  return (
    <>
      <div>
        <Label>事项类型</Label>
        <Select
          value={props.subjectType}
          onValueChange={(value) => {
            const next = value as SignableSubject
            props.setSubjectType(next)
            if (next === "methodology" || next === "workflow_change") {
              props.setRole("business_owner")
            }
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="asset">资产候选</SelectItem>
            <SelectItem value="memory">记忆候选</SelectItem>
            <SelectItem value="generation">生成结果</SelectItem>
            <SelectItem value="methodology">方法论</SelectItem>
            <SelectItem value="workflow_change">工作流变更</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>事项 ID</Label>
        <Input
          value={props.subjectId}
          onChange={(event) => props.setSubjectId(event.target.value)}
          placeholder={props.subjectType === "workflow_change" ? "须与工作流 ID 一致" : "真实记录 ID"}
          required
        />
      </div>
      <div>
        <Label>工作流 ID</Label>
        <Input
          value={props.workflowId}
          onChange={(event) => props.setWorkflowId(event.target.value)}
          required
        />
      </div>
      <div>
        <Label>签字角色</Label>
        <Select value={props.role} onValueChange={(value) => props.setRole(value as SignableRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {!dual ? <SelectItem value="reviewer">审核人</SelectItem> : null}
            <SelectItem value="business_owner">业务 Owner</SelectItem>
            {!dual ? <SelectItem value="backup_owner">备份 Owner</SelectItem> : null}
            <SelectItem value="system_owner">系统 Owner</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

function ApprovalDecisionFields(props: {
  decision: string
  setDecision: (value: string) => void
  reason: string
  setReason: (value: string) => void
}) {
  return (
    <>
      <div>
        <Label>决定</Label>
        <Select
          value={props.decision}
          onValueChange={(value) => {
            if (value) props.setDecision(value)
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="approve">批准</SelectItem>
            <SelectItem value="request_changes">要求修改</SelectItem>
            <SelectItem value="reject">拒绝</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>原因</Label>
        <Textarea
          value={props.reason}
          onChange={(event) => props.setReason(event.target.value)}
          required
        />
      </div>
    </>
  )
}

export function ApprovalDecisionForm() {
  const [subjectType, setSubjectType] = React.useState<SignableSubject>("asset")
  const [subjectId, setSubjectId] = React.useState("")
  const [workflowId, setWorkflowId] = React.useState("content-growth-v1")
  const [role, setRole] = React.useState<SignableRole>("reviewer")
  const [decision, setDecision] = React.useState("approve")
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [approvalId, setApprovalId] = React.useState<string | null>(null)

  async function sign(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setApprovalId(null)
    try {
      const response = await fetch("/api/admin/approval-decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectType,
          subjectId: subjectId.trim(),
          workflowId: workflowId.trim(),
          role,
          decision,
          reason: reason.trim(),
          requestId: `web:${crypto.randomUUID()}`,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "签字失败")
      setApprovalId(payload.item.id)
      toast.success(payload.idempotent ? "该请求已签字" : "审批签字已记录")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "签字失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={sign} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">审批签字</h2>
            <p className="text-xs text-muted-foreground">
              方法论和工作流变更须由不同身份的业务 Owner、系统 Owner 分别签字。
            </p>
          </div>
          <ApprovalSubjectFields
            subjectType={subjectType}
            setSubjectType={setSubjectType}
            subjectId={subjectId}
            setSubjectId={setSubjectId}
            workflowId={workflowId}
            setWorkflowId={setWorkflowId}
            role={role}
            setRole={setRole}
          />
          <ApprovalDecisionFields
            decision={decision}
            setDecision={setDecision}
            reason={reason}
            setReason={setReason}
          />
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "签字中…" : "确认签字"}
          </Button>
          {approvalId ? (
            <p className="break-all rounded bg-muted p-2 font-mono text-xs">
              approvalId={approvalId}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
