"use client"

import { Loader2, Plus } from "lucide-react"
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
import type { GovernanceAssignmentInput } from "@/lib/api/admin-client"

function FieldSelect(props: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <Label>{props.label}</Label>
      <Select
        value={props.value}
        onValueChange={(value) => {
          if (value != null) props.onChange(value)
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function IdentityFields(props: {
  draft: GovernanceAssignmentInput
  onChange: (next: GovernanceAssignmentInput) => void
}) {
  const { draft, onChange } = props
  return (
    <>
      <div>
        <Label>内部用户 ID</Label>
        <Input
          value={draft.userId ?? ""}
          onChange={(e) => onChange({ ...draft, userId: e.target.value })}
          placeholder="可选"
        />
      </div>
      <div>
        <Label>飞书 open_id</Label>
        <Input
          value={draft.externalOpenId ?? ""}
          onChange={(e) => onChange({ ...draft, externalOpenId: e.target.value })}
          placeholder="ou_xxx"
        />
      </div>
      <div>
        <Label>飞书 user_id</Label>
        <Input
          value={draft.externalUserId ?? ""}
          onChange={(e) => onChange({ ...draft, externalUserId: e.target.value })}
          placeholder="on_xxx"
        />
      </div>
    </>
  )
}

export function GovernanceAssignmentForm(props: {
  draft: GovernanceAssignmentInput
  saving: boolean
  onChange: (next: GovernanceAssignmentInput) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const { draft, saving, onChange, onSubmit } = props
  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">新增配置</h2>
          <FieldSelect
            label="范围类型"
            value={draft.scopeType}
            onChange={(v) =>
              onChange({
                ...draft,
                scopeType: v as GovernanceAssignmentInput["scopeType"],
                scopeId: v === "system" ? "global" : draft.scopeId,
                role: v === "system" ? "system_owner" : draft.role,
              })
            }
            options={[
              { value: "workflow", label: "工作流" },
              { value: "system", label: "系统" },
            ]}
          />
          <div>
            <Label>范围 ID</Label>
            <Input
              value={draft.scopeId}
              onChange={(e) => onChange({ ...draft, scopeId: e.target.value })}
              placeholder="content-growth-v1 或 global"
              required
            />
          </div>
          <FieldSelect
            label="角色"
            value={draft.role}
            onChange={(v) =>
              onChange({ ...draft, role: v as GovernanceAssignmentInput["role"] })
            }
            options={[
              { value: "business_owner", label: "业务 Owner" },
              { value: "backup_owner", label: "备份 Owner" },
              { value: "reviewer", label: "审核人" },
              { value: "system_owner", label: "系统 Owner" },
            ]}
          />
          <IdentityFields draft={draft} onChange={onChange} />
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            新增
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
