"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { GovernanceAssignmentItem } from "@/lib/api/admin-client"

const ROLE_LABEL: Record<string, string> = {
  business_owner: "业务 Owner",
  system_owner: "系统 Owner",
  reviewer: "审核人",
  backup_owner: "备份 Owner",
}

export function GovernanceAssignmentList(props: {
  items: GovernanceAssignmentItem[]
  total: number
  onToggle: (item: GovernanceAssignmentItem) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">共 {props.total} 条（本页最多 100）</p>
      {props.items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-start justify-between gap-4 py-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ROLE_LABEL[item.role] ?? item.role}</span>
                <Badge variant={item.status === "active" ? "default" : "outline"}>
                  {item.status === "active" ? "启用" : "停用"}
                </Badge>
                <Badge variant="secondary">{item.scopeType}</Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{item.scopeId}</p>
              <p className="text-xs text-muted-foreground">
                userId={item.userId || "—"} · open_id={item.externalOpenId || "—"} ·
                user_id={item.externalUserId || "—"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => props.onToggle(item)}>
              {item.status === "active" ? "停用" : "启用"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
