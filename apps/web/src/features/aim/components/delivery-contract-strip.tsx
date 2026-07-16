import { ArrowRight, Database, ShieldCheck, Target } from "lucide-react"
import type { buildAimDeliveryContract } from "@/lib/aim-delivery-contract"

export function DeliveryContractStrip({ contract }: { contract: ReturnType<typeof buildAimDeliveryContract> }) {
  const toneClass = {
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
    neutral: "text-foreground",
  }[contract.status.tone]
  const items = [
    { label: "任务", value: contract.task.label, detail: contract.task.detail, icon: Target, className: "text-foreground" },
    { label: "依据", value: contract.evidence.label, detail: contract.evidence.detail, icon: Database, className: "text-foreground" },
    { label: "状态", value: contract.status.label, detail: contract.status.detail, icon: ShieldCheck, className: toneClass },
    { label: "下一步", value: contract.next.label, detail: contract.next.detail, icon: ArrowRight, className: "text-foreground" },
  ]

  return (
    <div className="mb-4 border-y border-border/70 bg-muted/20">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {items.map(({ label, value, detail, icon: Icon, className }, index) => (
          <div
            key={label}
            className={`min-w-0 px-3 py-2.5 ${index % 2 === 1 ? "border-l border-border/60" : ""} ${index > 1 ? "border-t border-border/60 lg:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`}
            title={detail}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Icon className="h-3 w-3 shrink-0" />
              <span>{label}</span>
            </div>
            <p className={`mt-1 truncate text-xs font-medium ${className}`}>{value}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      {contract.expanded && (
        <div className="border-t border-border/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {contract.taskSpec?.mode === "discovery_exploration" && (
            <p className="text-amber-600 dark:text-amber-400">
              当前信息不足，无法给出确定方案；请先补充关键资料，再生成正式方案。
            </p>
          )}
          {contract.assumptions && contract.assumptions.length > 0 && (
            <p className="mt-1">
              <span className="font-medium text-foreground">本次假设：</span>
              {contract.assumptions.map((a) => `${a.statement}（影响${a.impact}）`).join("；")}
            </p>
          )}
          {contract.unknowns && contract.unknowns.length > 0 && (
            <p className="mt-1">
              <span className="font-medium text-foreground">待确认：</span>
              {contract.unknowns.join("；")}
            </p>
          )}
          {contract.knownFacts && contract.knownFacts.length > 0 && (
            <p className="mt-1">
              <span className="font-medium text-foreground">已知事实：</span>
              {contract.knownFacts.map((f) => f.statement).join("；")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
