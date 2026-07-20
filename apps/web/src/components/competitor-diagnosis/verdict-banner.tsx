import { Gem, TrendingUp, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ConfidenceTag } from "./confidence-tag"
import type { VerdictData } from "@/lib/competitor-diagnosis/types"

/**
 * 总判断条：三句话——核心资产 / 最强增长杠杆 / 最大风险。
 * 替代"先看一堆指标"的开场。
 */
/**
 * @description verdictbanner
 * @param options - 配置选项
 * @returns 无返回值
 */
export function VerdictBanner({ verdict }: { verdict: VerdictData }) {
  const items = [
    { icon: Gem, label: "核心资产", value: verdict.assetVerdict, color: "text-violet-600" },
    { icon: TrendingUp, label: "最强增长杠杆", value: verdict.growthVerdict, color: "text-sky-600" },
    { icon: AlertTriangle, label: "最大风险", value: verdict.riskVerdict, color: "text-amber-600" },
  ]

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">总判断</p>
          <ConfidenceTag level={verdict.confidence} reason="综合数据完整度与样本量得出" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex gap-2.5">
              <Icon className={`h-4 w-4 ${color} shrink-0 mt-0.5`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
                <p className="text-sm leading-relaxed">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
