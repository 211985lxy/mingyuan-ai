"use client"

import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { GovernanceAssignmentForm } from "@/components/admin/governance-assignment-form"
import { GovernanceAssignmentList } from "@/components/admin/governance-assignment-list"
import { ApprovalDecisionForm } from "@/components/admin/approval-decision-form"
import { useGovernanceAssignments } from "@/hooks/use-governance-assignments"

export default function AdminGovernancePage() {
  const g = useGovernanceAssignments()
  return (
    <AdminPageShell
      title="治理责任"
      subtitle="配置工作流业务 Owner / 备份 Owner / 审核人，以及系统 Owner。未配置时相关审批 fail closed。"
      loading={g.loading}
      error={g.error}
      onRetry={g.fetchItems}
      skeletonRows={4}
      empty={!g.loading && !g.error && g.items.length === 0}
      emptyMessage="还没有责任配置。先录入系统 Owner 与各工作流责任人。"
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={g.statusFilter}
            onValueChange={(v) => {
              if (v === "active" || v === "inactive" || v === "all") g.setStatusFilter(v)
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">仅启用</SelectItem>
              <SelectItem value="inactive">仅停用</SelectItem>
              <SelectItem value="all">全部</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void g.fetchItems()} disabled={g.loading}>
            <RotateCcw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <GovernanceAssignmentList items={g.items} total={g.total} onToggle={g.onToggle} />
        <div className="space-y-4">
          <GovernanceAssignmentForm
            draft={g.draft}
            saving={g.saving}
            onChange={g.setDraft}
            onSubmit={g.onCreate}
          />
          <ApprovalDecisionForm />
        </div>
      </div>
    </AdminPageShell>
  )
}
