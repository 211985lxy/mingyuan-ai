import { Rocket, Compass, Ban } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { StrategicBet } from "@/lib/competitor-diagnosis/types"

const BET_STYLE = {
  "主推": {
    ring: "border-primary/40 bg-primary/5",
    badge: "bg-primary text-primary-foreground hover:bg-primary",
    icon: Rocket,
    iconColor: "text-primary",
  },
  "备选": {
    ring: "border-sky-300 bg-sky-50",
    badge: "bg-sky-100 text-sky-700 hover:bg-sky-100",
    icon: Compass,
    iconColor: "text-sky-600",
  },
  "不建议": {
    ring: "border-zinc-300 bg-zinc-50",
    badge: "bg-zinc-200 text-zinc-600 hover:bg-zinc-200",
    icon: Ban,
    iconColor: "text-zinc-500",
  },
} as const

function BetRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  if (!value || value === "-") return null
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-16">{label}</span>
      <span className={accent ?? "text-foreground/90"}>{value}</span>
    </div>
  )
}

/**
 * 战略下注卡：主推 / 备选 / 不建议。
 */
export function BetCard({ bet }: { bet: StrategicBet }) {
  const style = BET_STYLE[bet.type]
  const Icon = style.icon
  const isNegative = bet.type === "不建议"

  return (
    <Card className={`border ${style.ring}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${style.iconColor}`} />
          <Badge className={style.badge}>{bet.type}下注</Badge>
        </div>

        <p className="text-sm font-semibold leading-snug">{bet.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{bet.reason}</p>

        <div className="space-y-1.5 pt-1 text-xs">
          {isNegative ? (
            <>
              <BetRow label="风险" value={bet.risk} />
              <BetRow label="止损信号" value={bet.stopLossSignal} accent="text-amber-700" />
            </>
          ) : (
            <>
              <BetRow label="成功条件" value={bet.successCondition} />
              <BetRow label="主要风险" value={bet.risk} />
              <BetRow label="所需资源" value={bet.resourceRequired} />
              <BetRow label="止损信号" value={bet.stopLossSignal} accent="text-amber-700" />
              <BetRow label="30天动作" value={bet.action30d} />
              <BetRow label="90天动作" value={bet.action90d} />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
