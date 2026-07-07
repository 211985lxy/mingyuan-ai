import { SectionTitle } from "./section-title"
import { BetCard } from "./bet-card"
import type { StrategicBet } from "@/lib/competitor-diagnosis/types"

const GROUPS: Array<{ type: StrategicBet["type"]; label: string }> = [
  { type: "主推", label: "主推下注" },
  { type: "备选", label: "备选下注" },
  { type: "不建议", label: "不建议下注" },
]

/**
 * 战略下注：主推 / 备选 / 不建议，含成功条件、资源、止损、30/90 天动作。
 */
export function StrategicBetSection({ bets }: { bets: StrategicBet[] }) {
  const visible = GROUPS.filter((g) => bets.some((b) => b.type === g.type))
  if (!visible.length) return null

  return (
    <section className="space-y-3">
      <SectionTitle
        title="战略下注"
        subtitle="下一步押什么、怎么验证、何时止损。所有下注都需 30 天小实验验证，不直接全量转型。"
        anchor="bets"
      />
      <div className="space-y-5">
        {visible.map((g) => {
          const groupBets = bets.filter((b) => b.type === g.type)
          return (
            <div key={g.type} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {g.label}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupBets.map((b, i) => (
                  <BetCard key={i} bet={b} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
